import { parseYaml } from 'obsidian';
import { KanbanSettings, settingKeyLookup } from 'src/Settings';
import { archiveString, completeString } from 'src/parsers/common';
import { parseLaneTitle } from 'src/parsers/helpers/parser';

/**
 * Reading and editing a board file as text, without a `StateManager`.
 *
 * A board that is not open in a view has no `StateManager`, so there is nothing
 * to parse it into a `Board` or to serialize it back. These helpers work on the
 * markdown directly: enough to list a board's lists, and to drop one card line
 * into one of them while leaving every other byte of the file alone.
 *
 * Only lane structure is interpreted here. Card text is inserted verbatim, so
 * nothing in this file depends on the destination board's settings.
 */

export interface MarkdownLane {
  /** Index among the board's lists, in file order. */
  index: number;
  /** Lane title with the `(n)` max-items suffix stripped, as `lane.data.title` has it. */
  title: string;
  /** Whether the list carries the `**Complete**` marker. */
  shouldMarkItemsComplete: boolean;
  /** Line the `#` heading sits on. */
  headingLine: number;
  /** One past the last line belonging to this list. */
  endLine: number;
}

const headingRe = /^#{1,6}\s+(.*?)\s*$/;
const fenceRe = /^\s*(?:```|~~~)/;
const cardRe = /^\s*[-*+]\s/;
const settingsRe = /^\s*%%\s*kanban:settings/;

function isBlank(line: string) {
  return line.trim() === '';
}

/**
 * The lists of a board file, in the order `astToUnhydratedBoard` would produce
 * them. Scanning stops at the `***` that precedes the archive, so archived
 * cards are never a target.
 */
export function parseLanesFromMarkdown(md: string): MarkdownLane[] {
  const lines = md.split('\n');
  const lanes: MarkdownLane[] = [];

  let inFrontmatter = false;
  let inFence = false;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (i === 0 && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }

    if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
      continue;
    }

    if (fenceRe.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;

    // Everything from the archive separator or the settings footer on is off limits
    if (trimmed === archiveString || settingsRe.test(line)) {
      end = i;
      break;
    }

    const heading = headingRe.exec(line);

    if (heading) {
      if (lanes.length) lanes.last().endLine = i;

      lanes.push({
        index: lanes.length,
        title: parseLaneTitle(heading[1]).title,
        shouldMarkItemsComplete: false,
        headingLine: i,
        endLine: lines.length,
      });

      continue;
    }

    // The `**Complete**` marker only counts ahead of the list's cards, the same
    // way the parser stops looking for it once it has found the list
    if (lanes.length && trimmed === completeString) {
      const lane = lanes.last();
      if (!hasCardBefore(lines, lane.headingLine, i)) lane.shouldMarkItemsComplete = true;
    }
  }

  if (lanes.length) lanes.last().endLine = Math.min(lanes.last().endLine, end);

  return lanes;
}

function hasCardBefore(lines: string[], from: number, to: number) {
  for (let i = from + 1; i < to; i++) {
    if (cardRe.test(lines[i])) return true;
  }

  return false;
}

/** One card of a list, as the lines it occupies. */
export interface MarkdownCard {
  /** The character between the brackets: `x` for `- [x] ...`. */
  checkChar: string;
  startLine: number;
  /** One past the card's last line. */
  endLine: number;
}

// Deliberately stricter than `cardRe`: only a card the serializer would have
// written this way is one this module is willing to move.
const cardStartRe = /^[-*+] \[(.)\](?=[ \t]|$)/;
const continuationRe = /^(?: {4}|\t)/;

/**
 * The cards of one list, in file order.
 *
 * A card runs from its `- [ ]` line to the last indented continuation line under
 * it, which is how `indentNewLines` writes a card that spans several lines. An
 * indented `- [x]` is a checklist item inside a card, not a card, and is part of
 * whichever card it sits under.
 */
export function parseCardsInLane(lines: string[], lane: MarkdownLane): MarkdownCard[] {
  const cards: MarkdownCard[] = [];

  for (let i = lane.headingLine + 1; i < lane.endLine; i++) {
    const match = cardStartRe.exec(lines[i]);
    if (!match) continue;

    let end = i + 1;
    while (end < lane.endLine && continuationRe.test(lines[end])) end++;

    cards.push({ checkChar: match[1], startLine: i, endLine: end });
    i = end - 1;
  }

  return cards;
}

export type InsertionMethod = KanbanSettings['new-card-insertion-method'];

/**
 * Line the card should be spliced in at.
 *
 * `append` goes after the list's last non-blank line, which is its last card
 * (or the heading / `**Complete**` marker when the list is empty). `prepend`
 * goes in front of the first card. Both keep the blank line the serializer
 * leaves under a heading.
 */
export function findInsertLine(
  lines: string[],
  lane: MarkdownLane,
  method: InsertionMethod = 'append'
): number {
  if (method === 'prepend' || method === 'prepend-compact') {
    for (let i = lane.headingLine + 1; i < lane.endLine; i++) {
      if (cardRe.test(lines[i])) return i;
    }
  }

  let i = lane.endLine - 1;
  while (i > lane.headingLine && isBlank(lines[i])) i--;

  if (i === lane.headingLine && isBlank(lines[i + 1] ?? '')) i++;

  return i + 1;
}

/**
 * `md` with `itemMd` (a `- [ ] ...` line, possibly with indented continuation
 * lines) added to the given list. Nothing else in the file is touched.
 */
export function insertItemIntoLane(
  md: string,
  lane: MarkdownLane,
  itemMd: string,
  method: InsertionMethod = 'append'
): string {
  const lines = md.split('\n');

  lines.splice(findInsertLine(lines, lane, method), 0, ...itemMd.split('\n'));

  return lines.join('\n');
}

/**
 * The board's settings the way `parseMarkdown` resolves them: the settings
 * footer, with any setting key in the file's frontmatter taking precedence.
 */
export function parseBoardSettings(md: string): KanbanSettings {
  return { ...parseSettingsFromMarkdown(md), ...parseSettingsFromFrontmatter(md) };
}

/**
 * The setting keys carried by the file's frontmatter. Frontmatter keys that are
 * not settings belong to the note and are ignored here.
 */
export function parseSettingsFromFrontmatter(md: string): KanbanSettings {
  const lines = md.split('\n');
  if (lines[0]?.trim() !== '---') return {};

  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end === -1) return {};

  let frontmatter: Record<string, any>;

  try {
    frontmatter = parseYaml(lines.slice(1, end).join('\n')) || {};
  } catch (e) {
    return {};
  }

  const settings: KanbanSettings = {};

  for (const key of Object.keys(frontmatter)) {
    if (settingKeyLookup.has(key as keyof KanbanSettings)) {
      (settings as Record<string, any>)[key] = frontmatter[key];
    }
  }

  return settings;
}

/**
 * The board's own settings, read out of the `%% kanban:settings` footer.
 * Returns `{}` for a board that has none, or one whose footer will not parse —
 * a board is still perfectly usable without it.
 */
export function parseSettingsFromMarkdown(md: string): KanbanSettings {
  const start = md.lastIndexOf('%% kanban:settings');

  if (start === -1) return {};

  const match = /```[^\n]*\n([\s\S]*?)```/.exec(md.slice(start));

  if (!match) return {};

  try {
    return JSON.parse(match[1].trim());
  } catch (e) {
    return {};
  }
}
