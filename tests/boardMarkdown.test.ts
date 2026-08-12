import {
  insertItemIntoLane,
  parseBoardSettings,
  parseCardsInLane,
  parseLanesFromMarkdown,
  parseSettingsFromMarkdown,
} from 'src/helpers/boardMarkdown';
import { describe, expect, it } from 'vitest';

import { wrapBoard } from './helpers/boards';
import { loadBoard } from './helpers/harness';

/**
 * Reading and editing a board file as text, which is how a card reaches a board
 * that isn't open. The last group checks the result against the real parser.
 */

const board = wrapBoard([
  '## Todo',
  '',
  '- [ ] First',
  '- [ ] Second',
  '',
  '',
  '',
  '## Doing (3)',
  '',
  '',
  '',
  '',
  '## Done',
  '',
  '**Complete**',
  '- [x] Finished',
  '',
  '',
  '',
  '***',
  '',
  '## Archive',
  '',
  '- [x] Archived long ago',
]);

function lanes(md: string) {
  return parseLanesFromMarkdown(md);
}

describe('parseLanesFromMarkdown', () => {
  it('lists the board lists in file order', () => {
    expect(lanes(board).map((l) => [l.index, l.title])).toEqual([
      [0, 'Todo'],
      [1, 'Doing'],
      [2, 'Done'],
    ]);
  });

  it('strips the max-items suffix, the way lane.data.title has it', () => {
    expect(lanes(board)[1].title).toBe('Doing');
  });

  it('flags the list that marks its cards complete', () => {
    expect(lanes(board).map((l) => l.shouldMarkItemsComplete)).toEqual([false, false, true]);
  });

  it('does not offer the archive as a destination', () => {
    expect(lanes(board).map((l) => l.title)).not.toContain('Archive');
  });

  it('ignores headings inside the settings footer and code fences', () => {
    const md = wrapBoard([
      '## Todo',
      '',
      '- [ ] A card with a fenced block',
      '    ```md',
      '    ## Not a list',
      '    ```',
      '',
      '',
      '',
    ]);

    expect(lanes(md).map((l) => l.title)).toEqual(['Todo']);
  });

  it('reads a board with no lists as having none', () => {
    expect(lanes(wrapBoard([]))).toEqual([]);
  });
});

describe('insertItemIntoLane', () => {
  const insert = (md: string, index: number, itemMd: string, method?: any) =>
    insertItemIntoLane(md, parseLanesFromMarkdown(md)[index], itemMd, method).split('\n');

  it('appends after the last card of the list', () => {
    const lines = insert(board, 0, '- [ ] Third');

    expect(lines.slice(lines.indexOf('## Todo'), lines.indexOf('## Doing (3)'))).toEqual([
      '## Todo',
      '',
      '- [ ] First',
      '- [ ] Second',
      '- [ ] Third',
      '',
      '',
      '',
    ]);
  });

  it('prepends in front of the first card', () => {
    const lines = insert(board, 0, '- [ ] Zeroth', 'prepend');

    expect(lines.slice(lines.indexOf('## Todo'), lines.indexOf('## Doing (3)'))).toEqual([
      '## Todo',
      '',
      '- [ ] Zeroth',
      '- [ ] First',
      '- [ ] Second',
      '',
      '',
      '',
    ]);
  });

  it('keeps the blank line under the heading when the list is empty', () => {
    const lines = insert(board, 1, '- [ ] Only');

    expect(lines.slice(lines.indexOf('## Doing (3)'), lines.indexOf('## Done'))).toEqual([
      '## Doing (3)',
      '',
      '- [ ] Only',
      '',
      '',
      '',
    ]);
  });

  it('goes under the Complete marker, not above it', () => {
    const lines = insert(board, 2, '- [x] Also finished');
    const done = lines.indexOf('## Done');

    expect(lines.slice(done, done + 5)).toEqual([
      '## Done',
      '',
      '**Complete**',
      '- [x] Finished',
      '- [x] Also finished',
    ]);
  });

  it('splices a multi-line card in as its own lines', () => {
    const lines = insert(board, 0, '- [ ] Two lines\n    and the rest');

    expect(lines).toContain('- [ ] Two lines');
    expect(lines).toContain('    and the rest');
  });

  it('leaves the archive and the settings footer alone', () => {
    const md = insertItemIntoLane(board, parseLanesFromMarkdown(board)[0], '- [ ] Third');

    expect(md).toContain('- [x] Archived long ago');
    expect(md.split('\n').slice(-4)).toEqual(board.split('\n').slice(-4));
    expect(md.length).toBe(board.length + '- [ ] Third\n'.length);
  });
});

describe('parseSettingsFromMarkdown', () => {
  it('reads the board settings out of the footer', () => {
    const md = wrapBoard(['## Todo', ''], { 'new-card-insertion-method': 'prepend' });

    expect(parseSettingsFromMarkdown(md)['new-card-insertion-method']).toBe('prepend');
  });

  it('is empty for a board without a footer, or with a broken one', () => {
    expect(parseSettingsFromMarkdown('## Todo\n')).toEqual({});
    expect(parseSettingsFromMarkdown('%% kanban:settings\n```\n{nope\n```\n%%')).toEqual({});
  });
});

describe('parseCardsInLane', () => {
  const cardsIn = (md: string, laneIndex: number) =>
    parseCardsInLane(md.split('\n'), parseLanesFromMarkdown(md)[laneIndex]);

  it("finds a list's cards with their check characters", () => {
    expect(cardsIn(board, 0).map((c) => c.checkChar)).toEqual([' ', ' ']);
    expect(cardsIn(board, 2).map((c) => c.checkChar)).toEqual(['x']);
  });

  it('gives each card the lines it occupies', () => {
    const lines = board.split('\n');
    const [first] = cardsIn(board, 0);

    expect(lines.slice(first.startLine, first.endLine)).toEqual(['- [ ] First']);
  });

  it('takes the indented continuation lines of a multi-line card', () => {
    const md = wrapBoard(['## Todo', '', '- [ ] Spans', '    a second line', '- [ ] Next', '', '']);
    const lines = md.split('\n');
    const cards = cardsIn(md, 0);

    expect(cards).toHaveLength(2);
    expect(lines.slice(cards[0].startLine, cards[0].endLine)).toEqual([
      '- [ ] Spans',
      '    a second line',
    ]);
  });

  it('reads an indented checkbox as part of the card above it, not as a card', () => {
    const md = wrapBoard(['## Todo', '', '- [ ] Has a checklist', '    - [x] step one', '', '']);

    expect(cardsIn(md, 0)).toHaveLength(1);
  });

  it('finds nothing in an empty list', () => {
    expect(cardsIn(board, 1)).toEqual([]);
  });

  it('does not reach past the list it was given', () => {
    // the archive sits after the `***`, which parseLanesFromMarkdown stops at
    expect(cardsIn(board, 2).map((c) => c.checkChar)).toEqual(['x']);
  });
});

describe('parseBoardSettings', () => {
  it('reads the settings footer', () => {
    expect(parseBoardSettings(wrapBoard(['## Todo', ''], { 'done-lane-name': 'Klaar' }))).toEqual({
      'kanban-plugin': 'board',
      'done-lane-name': 'Klaar',
    });
  });

  it('lets a setting in the frontmatter win, as the parser does', () => {
    const md = wrapBoard(['## Todo', ''], { 'done-lane-name': 'Klaar' }).replace(
      'kanban-plugin: board\n',
      'kanban-plugin: board\ndone-lane-name: Afgerond\n'
    );

    expect(parseBoardSettings(md)['done-lane-name']).toBe('Afgerond');
  });

  it('ignores frontmatter keys that are not settings', () => {
    const md = wrapBoard(['## Todo', '']).replace(
      'kanban-plugin: board\n',
      'kanban-plugin: board\nauthor: nobody\n'
    );

    expect(parseBoardSettings(md)).not.toHaveProperty('author');
  });

  it('copes with a board that has no frontmatter at all', () => {
    expect(parseBoardSettings('## Todo\n\n- [ ] a\n')).toEqual({});
  });
});

describe('the result, read back by the real parser', () => {
  it('parses as the same board with one more card', async () => {
    const before = await loadBoard(board);
    const md = insertItemIntoLane(board, parseLanesFromMarkdown(board)[1], '- [ ] Only');
    const after = await loadBoard(md);

    expect(after.errors()).toEqual([]);
    expect(after.board().children.map((l) => l.data.title)).toEqual(
      before.board().children.map((l) => l.data.title)
    );
    expect(after.board().children[1].data.maxItems).toBe(3);
    expect(after.board().children[1].children.map((i) => i.data.titleRaw)).toEqual(['Only']);
    expect(after.board().data.archive.map((i) => i.data.titleRaw)).toEqual(['Archived long ago']);
  });
});
