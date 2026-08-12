import { App, TFile, debounce } from 'obsidian';
import { KanbanSettings } from 'src/Settings';
import { getTaskStatusDone } from 'src/parsers/helpers/inlineMetadata';

import { hasFrontmatterKey } from '../helpers';
import {
  MarkdownLane,
  insertItemIntoLane,
  parseBoardSettings,
  parseCardsInLane,
  parseLanesFromMarkdown,
} from './boardMarkdown';
import { AutoMoveDoneOptions, DEFAULT_DONE_LANE_NAME, matchesLaneName } from './completeItem';
import { listKanbanBoards } from './moveCardToBoard';

/**
 * Auto-move for a board no view has open.
 *
 * The point of collecting tasks in a `dataview` or `tasks` query is to work from
 * the query instead of the board, so the board is usually closed when its
 * checkbox is ticked — and a closed board has no `StateManager`, no parsed
 * `Board` and nothing watching it. These helpers apply the same rule
 * `autoMoveCompletedItems` applies in memory (a complete card does not sit
 * outside the done lane) to the file as text, so the move has already happened
 * by the time the board is opened.
 *
 * Text, not parse-and-serialize: a closed board cannot be parsed without a
 * `StateManager`, and splicing lines leaves every other byte of the file alone.
 * See `boardMarkdown.ts`, which the cross-board card move uses the same way.
 */

/** How the auto-move settings resolve for a board file, with no board in memory. */
export function boardFileAutoMoveOptions(
  md: string,
  globalSettings: KanbanSettings
): AutoMoveDoneOptions {
  const settings = parseBoardSettings(md);
  const get = <K extends keyof KanbanSettings>(key: K): KanbanSettings[K] =>
    settings[key] !== undefined ? settings[key] : globalSettings?.[key];

  return {
    enabled: !!get('auto-move-done-to-lane'),
    laneName: get('done-lane-name') || DEFAULT_DONE_LANE_NAME,
    insertionMethod: get('new-card-insertion-method'),
  };
}

function findDoneLane(lanes: MarkdownLane[], laneName: string): MarkdownLane | undefined {
  return lanes.find((lane) => matchesLaneName(lane.title, laneName));
}

/**
 * `md` with every complete card that sits outside the done list moved into it,
 * or `null` when there is nothing to do.
 *
 * Lists marked `**Complete**` are skipped, the same way `autoMoveCompletedItems`
 * skips them, and `parseLanesFromMarkdown` already stops at the archive.
 */
export function sweepCompletedCards(md: string, options: AutoMoveDoneOptions): string | null {
  if (!options.enabled) return null;

  const lanes = parseLanesFromMarkdown(md);
  const doneLane = findDoneLane(lanes, options.laneName);

  if (!doneLane) return null;

  const lines = md.split('\n');
  const doneChar = getTaskStatusDone();
  const moving: Array<{ startLine: number; endLine: number }> = [];

  for (const lane of lanes) {
    if (lane === doneLane || lane.shouldMarkItemsComplete) continue;

    for (const card of parseCardsInLane(lines, lane)) {
      if (card.checkChar === doneChar) moving.push(card);
    }
  }

  if (!moving.length) return null;

  const cards = moving.map(({ startLine, endLine }) => lines.slice(startLine, endLine).join('\n'));

  // Back to front, so the earlier ranges keep their line numbers
  for (const { startLine, endLine } of [...moving].reverse()) {
    lines.splice(startLine, endLine - startLine);
  }

  // Re-read the lists per card: each insert shifts the lines after it. The done
  // list keeps its index because no list is added or removed along the way.
  return cards.reduce((next, card) => {
    const lane = parseLanesFromMarkdown(next)[doneLane.index];
    if (!lane) return next;

    return insertItemIntoLane(next, lane, card, options.insertionMethod);
  }, lines.join('\n'));
}

/**
 * Applies the sweep to one board file. Returns whether it wrote anything.
 *
 * The read decides whether there is work, and `vault.process` does the write
 * against the file's current contents, so an edit landing in between is not
 * clobbered.
 */
export async function sweepBoardFile(
  app: App,
  file: TFile,
  globalSettings: KanbanSettings
): Promise<boolean> {
  const md = await app.vault.cachedRead(file);

  if (!sweepCompletedCards(md, boardFileAutoMoveOptions(md, globalSettings))) return false;

  await app.vault.process(file, (current) => {
    return (
      sweepCompletedCards(current, boardFileAutoMoveOptions(current, globalSettings)) ?? current
    );
  });

  return true;
}

export interface SweepHost {
  app: App;
  /** A board some view has open handles this itself, through its `StateManager`. */
  isOpen: (file: TFile) => boolean;
  getGlobalSettings: () => KanbanSettings;
}

/**
 * Runs the sweep over closed board files: on startup, for ticks that happened
 * while Obsidian was not running, and after a file changes, for the ones that
 * happen while it is.
 */
export class ClosedBoardSweeper {
  private host: SweepHost;
  private queued: Set<TFile> = new Set();

  constructor(host: SweepHost) {
    this.host = host;
  }

  /**
   * Debounced, and long enough that a plugin writing several lines into a board
   * is finished before we read it. Whether a file is a board, and whether it is
   * open, is decided when the queue drains rather than here: the metadata cache
   * may not have caught up with the change yet.
   */
  private flush = debounce(
    () => {
      const files = Array.from(this.queued);
      this.queued.clear();

      for (const file of files) {
        if (this.shouldSweep(file)) this.sweep(file);
      }
    },
    2000,
    true
  );

  private shouldSweep(file: TFile) {
    return file.extension === 'md' && !this.host.isOpen(file) && hasFrontmatterKey(file);
  }

  private async sweep(file: TFile) {
    try {
      await sweepBoardFile(this.host.app, file, this.host.getGlobalSettings());
    } catch (e) {
      console.error(`Kanban: could not auto-move completed cards in ${file.path}`, e);
    }
  }

  /** A file changed on disk. */
  queue(file: TFile) {
    this.queued.add(file);
    this.flush();
  }

  /** Every closed board in the vault, for the pass at startup. */
  async sweepAll() {
    for (const file of listKanbanBoards(this.host.app)) {
      if (!this.host.isOpen(file)) await this.sweep(file);
    }
  }

  destroy() {
    this.queued.clear();
    this.flush.cancel();
  }
}
