/**
 * Upstream behaviour guard: markdown -> board.
 *
 * These are smoke tests, not a spec. They pin the parser features a real board
 * depends on — lanes, cards, checkbox state, WIP limits, the complete list, the
 * archive, frontmatter/settings split, tags, dates, links, block ids — so that
 * merging upstream tells us what changed instead of us finding out in Obsidian.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';

import { KITCHEN_SINK, itemByTitle, laneTitles, wrapBoard } from '../helpers/boards';
import { boardShape } from '../helpers/fixtures';
import { loadBoard } from '../helpers/harness';

describe('parsing a board', () => {
  it('reads lanes and their cards out of headings and lists', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo', '', '- [ ] One', '- [ ] Two', '', '## Doing', '', '- [ ] Three'])
    );

    expect(harness.errors()).toEqual([]);
    expect(boardShape(harness.board())).toEqual({
      Todo: ['One', 'Two'],
      Doing: ['Three'],
    });
  });

  it('keeps a heading with no list as an empty lane', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '## Doing', '', '- [ ] One']));

    expect(laneTitles(harness.board())).toEqual(['Todo', 'Doing']);
    expect(harness.board().children[0].children).toEqual([]);
  });

  it('reads the checkbox state, including a non-x status character', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo', '', '- [ ] Open', '- [x] Done', '- [/] In progress'])
    );

    expect(
      harness.board().children[0].children.map((i) => [i.data.checked, i.data.checkChar])
    ).toEqual([
      [false, ' '],
      [true, 'x'],
      [true, '/'],
    ]);
  });

  it('splits a trailing (n) off a lane title into a WIP limit', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo (3)', '', '- [ ] One']));
    const lane = harness.board().children[0];

    expect(lane.data.title).toBe('Todo');
    expect(lane.data.maxItems).toBe(3);
  });

  it('marks a lane complete when its list is preceded by **Complete**', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo', '', '- [ ] One', '', '## Done', '', '**Complete**', '', '- [x] Two'])
    );

    expect(harness.board().children.map((l) => !!l.data.shouldMarkItemsComplete)).toEqual([
      false,
      true,
    ]);
  });

  it('routes the list after *** + ## Archive into the archive, not a lane', async () => {
    const harness = await loadBoard(
      wrapBoard([
        '## Todo',
        '',
        '- [ ] One',
        '',
        '***',
        '',
        '## Archive',
        '',
        '- [x] Old one',
        '- [x] Old two',
      ])
    );

    expect(laneTitles(harness.board())).toEqual(['Todo']);
    expect(harness.board().data.archive.map((i) => i.data.titleRaw)).toEqual([
      'Old one',
      'Old two',
    ]);
  });

  it('turns a multi-line card back into a single card with newlines', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo', '', '- [ ] First line', '    second line', '- [ ] Another card'])
    );

    expect(boardShape(harness.board())).toEqual({
      Todo: ['First line\nsecond line', 'Another card'],
    });
  });

  it('pulls a block id off the card text', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] A card ^abc123']));
    const item = harness.board().children[0].children[0];

    expect(item.data.titleRaw).toBe('A card');
    expect(item.data.blockId).toBe('abc123');
  });
});

describe('parsing card metadata', () => {
  it('collects tags, sorted, and leaves the raw text alone', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card #zebra and #alpha']));
    const item = harness.board().children[0].children[0];

    expect(item.data.metadata.tags).toEqual(['#alpha', '#zebra']);
    expect(item.data.titleRaw).toBe('Card #zebra and #alpha');
  });

  it('strips tags from the rendered title only when move-tags is on', async () => {
    const off = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card #alpha']));
    const on = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card #alpha']), {
      'move-tags': true,
    });

    expect(off.board().children[0].children[0].data.title).toBe('Card #alpha');
    expect(on.board().children[0].children[0].data.title).toBe('Card');
  });

  it('reads a date and a time from the default triggers', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo', '', '- [ ] Card @{2026-08-07} @@{10:15}'])
    );
    const { metadata } = harness.board().children[0].children[0].data;

    expect(metadata.dateStr).toBe('2026-08-07');
    expect(metadata.timeStr).toBe('10:15');
    // hydration turns both into moments, with the time folded onto the date
    expect(metadata.date.format('YYYY-MM-DD')).toBe('2026-08-07');
    expect(metadata.time.format('YYYY-MM-DD HH:mm')).toBe('2026-08-07 10:15');
  });

  it('honours a custom date trigger and date format', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card ~{07/08/2026}']), {
      'date-trigger': '~',
      'date-format': 'DD/MM/YYYY',
    });
    const { metadata } = harness.board().children[0].children[0].data;

    expect(metadata.dateStr).toBe('07/08/2026');
    expect(metadata.date.format('YYYY-MM-DD')).toBe('2026-08-07');
  });

  it('records a wikilink as a file accessor', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] See [[Some Note]]']));
    const { metadata } = harness.board().children[0].children[0].data;

    expect(metadata.fileAccessor).toMatchObject({ target: 'Some Note', isEmbed: false });
  });

  it('records an embed as an embedded file accessor', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Look ![[Image.png]]']));
    const { metadata } = harness.board().children[0].children[0].data;

    expect(metadata.fileAccessor).toMatchObject({ target: 'Image.png', isEmbed: true });
  });

  it('builds a lowercased search string out of the card text, tags and date', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo', '', '- [ ] Buy MILK #groceries @{2026-08-07}'])
    );
    const { titleSearch } = harness.board().children[0].children[0].data;

    expect(titleSearch).toContain('buy milk');
    expect(titleSearch).toContain('#groceries');
    expect(titleSearch).toContain('2026-08-07');
  });
});

describe('parsing frontmatter and the settings footer', () => {
  it('splits frontmatter into board frontmatter and settings', async () => {
    const harness = await loadBoard(
      [
        '---',
        '',
        'kanban-plugin: board',
        'author: nobody',
        'show-checkboxes: true',
        '',
        '---',
        '',
        '',
        '## Todo',
        '',
        '- [ ] One',
      ].join('\n')
    );

    // a known setting key moves into settings, anything else stays frontmatter
    expect(harness.board().data.frontmatter).toEqual({
      'kanban-plugin': 'board',
      author: 'nobody',
    });
    expect(harness.board().data.settings['show-checkboxes']).toBe(true);
  });

  it('normalizes the legacy `basic` format to `board`', async () => {
    const harness = await loadBoard(
      ['---', '', 'kanban-plugin: basic', '', '---', '', '', '## Todo'].join('\n')
    );

    expect(harness.board().data.frontmatter['kanban-plugin']).toBe('board');
    expect(harness.board().data.settings['kanban-plugin']).toBe('board');
  });

  it('reads per-board settings out of the trailing codeblock', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo', '', '- [ ] One'], { 'lane-width': 400, 'show-checkboxes': false })
    );

    expect(harness.stateManager.getSetting('lane-width')).toBe(400);
    expect(harness.stateManager.getSetting('show-checkboxes')).toBe(false);
  });
});

describe('parsing failures', () => {
  // StateManager.getParsedBoard logs the failure as well as recording it, which
  // is how it reaches Obsidian's developer console. Stubbing the logger here
  // keeps a passing run quiet — an unexpected console.error is worth noticing —
  // and lets the tests assert that reporting rather than just tolerate it.
  // `restoreMocks` puts the real console.error back after each test.
  const silenceConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('records an error rather than throwing when the settings block is not JSON', async () => {
    const logged = silenceConsoleError();
    const md = wrapBoard(['## Todo', '', '- [ ] One']).replace(
      '{"kanban-plugin":"board"}',
      '{not json'
    );
    const harness = await loadBoard(md);

    expect(harness.errors().join()).toMatch(/SyntaxError/);
    expect(logged).toHaveBeenCalled();
    // and, crucially, nothing is written back over the user's file
    expect(harness.markdown()).toBe('');
  });

  it('records an error when the file has no frontmatter at all', async () => {
    const logged = silenceConsoleError();
    const harness = await loadBoard('## Todo\n\n- [ ] One\n');

    expect(harness.errors().join()).toMatch(/frontmatter/);
    expect(logged).toHaveBeenCalled();
    expect(harness.markdown()).toBe('');
  });

  it('treats an empty file as an empty board', async () => {
    const harness = await loadBoard('');

    expect(harness.errors()).toEqual([]);
    expect(harness.board().children).toEqual([]);
  });
});

describe('the kitchen sink fixture', () => {
  const md = readFileSync(resolve(__dirname, '..', KITCHEN_SINK), 'utf8');

  it('parses every feature it exercises in one go', async () => {
    const harness = await loadBoard(md);
    const board = harness.board();

    expect(harness.errors()).toEqual([]);
    expect(laneTitles(board)).toEqual(['Backlog', 'Doing', 'Done', 'Empty list']);
    expect(board.children[0].data.maxItems).toBe(3);
    expect(board.children[2].data.shouldMarkItemsComplete).toBe(true);
    expect(board.children[3].children).toEqual([]);
    expect(board.data.archive.map((i) => i.data.titleRaw)).toEqual(['Something archived']);
    expect(board.data.frontmatter).toEqual({ 'kanban-plugin': 'board', author: 'nobody' });

    expect(itemByTitle(board, 'A card with #tags').data.metadata.tags).toEqual(['#tags', '#zebra']);
    expect(itemByTitle(board, 'A card with a date').data.metadata.dateStr).toBe('2026-08-07');
    expect(itemByTitle(board, 'A card with a block id').data.blockId).toBe('abc123');
    expect(itemByTitle(board, 'A card that spans').data.titleRaw).toBe(
      'A card that spans\nmore than one line'
    );
  });
});
