import { KanbanSettings } from 'src/Settings';
import { Board, Item } from 'src/components/types';

/** Path of the kitchen sink board, relative to `tests/`. */
export const KITCHEN_SINK = 'fixtures/kitchen-sink.md';

/**
 * Wraps lane markdown in the frontmatter and settings codeblock every board
 * file has, so a test only has to spell out the part it cares about.
 */
export function wrapBoard(body: string[], settings: KanbanSettings = {}): string {
  return [
    '---',
    '',
    'kanban-plugin: board',
    '',
    '---',
    '',
    '',
    ...body,
    '',
    '',
    '%% kanban:settings',
    '```',
    JSON.stringify({ 'kanban-plugin': 'board', ...settings }),
    '```',
    '%%',
  ].join('\n');
}

export function laneTitles(board: Board): string[] {
  return board.children.map((lane) => lane.data.title);
}

/** The first card whose raw title starts with `titleRaw`. */
export function itemByTitle(board: Board, titleRaw: string): Item {
  for (const lane of board.children) {
    const item = lane.children.find((i) => i.data.titleRaw.startsWith(titleRaw));
    if (item) return item;
  }

  throw new Error(`No card starting with ${JSON.stringify(titleRaw)} on the board`);
}
