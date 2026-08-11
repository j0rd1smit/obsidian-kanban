/**
 * Upstream behaviour guard: the board modifier API.
 *
 * `getBoardModifiers` is what every card and list menu item in the UI calls, so
 * these cover the user-visible operations — add / insert / duplicate / delete /
 * move a card, add / rename / delete / archive a list — end to end through the
 * real state manager, down to the markdown written back to disk.
 */
import { generateInstanceId } from 'src/components/helpers';
import { Lane, LaneTemplate } from 'src/components/types';
import { describe, expect, it } from 'vitest';

import { wrapBoard } from '../helpers/boards';
import { boardShape } from '../helpers/fixtures';
import { Harness, loadBoard } from '../helpers/harness';

function threeLanes() {
  return wrapBoard([
    '## Todo',
    '',
    '- [ ] One',
    '- [ ] Two',
    '',
    '## Doing',
    '',
    '- [ ] Three',
    '',
    '## Done',
    '',
    '**Complete**',
    '- [x] Four',
  ]);
}

function newLane(title: string): Lane {
  return {
    ...LaneTemplate,
    id: generateInstanceId(),
    children: [],
    data: { title, shouldMarkItemsComplete: false },
  };
}

function card(harness: Harness, content: string, checkChar = ' ') {
  return harness.stateManager.getNewItem(content, checkChar);
}

describe('card operations', () => {
  it('appends a card to the end of a lane', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.appendItems([0, 1], [card(harness, 'Three and a half')]);

    expect(boardShape(harness.board()).Todo).toEqual(['One', 'Two', 'Three and a half']);
    expect(harness.markdown()).toContain('- [ ] Two\n- [ ] Three and a half');
  });

  it('prepends a card to the front of a lane', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.prependItems([0, 1], [card(harness, 'Zero')]);

    expect(boardShape(harness.board()).Todo).toEqual(['Zero', 'One', 'Two']);
  });

  it('inserts a card at a specific index', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.insertItems([0, 1], [card(harness, 'One and a half')]);

    expect(boardShape(harness.board()).Todo).toEqual(['One', 'One and a half', 'Two']);
  });

  it('moves a card to the top and to the bottom of its lane', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.moveItemToTop([0, 1]);
    expect(boardShape(harness.board()).Todo).toEqual(['Two', 'One']);

    harness.boardModifiers.moveItemToBottom([0, 0]);
    expect(boardShape(harness.board()).Todo).toEqual(['One', 'Two']);
  });

  it('duplicates a card next to the original, with a fresh id', async () => {
    const harness = await loadBoard(threeLanes());
    const original = harness.board().children[0].children[0];

    harness.boardModifiers.duplicateEntity([0, 0]);

    const [first, second] = harness.board().children[0].children;
    expect(boardShape(harness.board()).Todo).toEqual(['One', 'One', 'Two']);
    expect(first.id).not.toBe(second.id);
    expect(original.data.titleRaw).toBe(second.data.titleRaw);
  });

  it('deletes a card', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.deleteEntity([0, 0]);

    expect(boardShape(harness.board()).Todo).toEqual(['Two']);
    expect(harness.markdown()).not.toContain('- [ ] One');
  });

  it('replaces a card, reparsing its metadata', async () => {
    const harness = await loadBoard(threeLanes());
    const item = harness.board().children[0].children[0];

    harness.boardModifiers.updateItem(
      [0, 0],
      harness.stateManager.updateItemContent(item, 'One, revised #urgent @{2026-08-07}')
    );

    const updated = harness.board().children[0].children[0];
    expect(updated.data.titleRaw).toBe('One, revised #urgent @{2026-08-07}');
    expect(updated.data.metadata.tags).toEqual(['#urgent']);
    expect(updated.data.metadata.date.format('YYYY-MM-DD')).toBe('2026-08-07');
    expect(harness.markdown()).toContain('- [ ] One, revised #urgent @{2026-08-07}');
  });

  it('splits one card into several', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.splitItem([0, 0], [card(harness, 'One a'), card(harness, 'One b')]);

    expect(boardShape(harness.board()).Todo).toEqual(['One a', 'One b', 'Two']);
  });
});

describe('list operations', () => {
  it('adds a list at the end of the board', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.addLane(newLane('Later'));

    expect(harness.board().children.map((l) => l.data.title)).toEqual([
      'Todo',
      'Doing',
      'Done',
      'Later',
    ]);
    expect(harness.markdown()).toContain('## Later');
  });

  it('inserts a list at a given position', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.insertLane([1], newLane('Blocked'));

    expect(harness.board().children.map((l) => l.data.title)).toEqual([
      'Todo',
      'Blocked',
      'Doing',
      'Done',
    ]);
  });

  it('updates a list, including its WIP limit and complete flag', async () => {
    const harness = await loadBoard(threeLanes());
    const lane = harness.board().children[0];

    harness.boardModifiers.updateLane([0], {
      ...lane,
      data: { ...lane.data, title: 'To do', maxItems: 5, shouldMarkItemsComplete: true },
    });

    expect(harness.markdown()).toContain('## To do (5)');
    expect(harness.markdown()).toMatch(/## To do \(5\)\n\n\*\*Complete\*\*\n- \[ \] One/);
  });

  it('deletes a list and its cards', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.deleteEntity([0]);

    expect(harness.board().children.map((l) => l.data.title)).toEqual(['Doing', 'Done']);
    expect(harness.markdown()).not.toContain('## Todo');
    expect(harness.markdown()).not.toContain('- [ ] One');
  });

  it('duplicates a list with its cards', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.duplicateEntity([0]);

    expect(harness.board().children.map((l) => l.data.title)).toEqual([
      'Todo',
      'Todo',
      'Doing',
      'Done',
    ]);
    expect(boardShape(harness.board()).Todo).toEqual(['One', 'Two']);
  });
});

describe('archiving', () => {
  it('archives a single card', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.archiveItem([0, 0]);

    expect(boardShape(harness.board()).Todo).toEqual(['Two']);
    expect(harness.board().data.archive.map((i) => i.data.titleRaw)).toEqual(['One']);
    expect(harness.markdown()).toMatch(/\*\*\*\n\n## Archive\n\n- \[ \] One/);
  });

  it('archives a whole list, removing it from the board', async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.archiveLane([0]);

    expect(harness.board().children.map((l) => l.data.title)).toEqual(['Doing', 'Done']);
    expect(harness.board().data.archive.map((i) => i.data.titleRaw)).toEqual(['One', 'Two']);
  });

  it("archives a list's cards but keeps the list", async () => {
    const harness = await loadBoard(threeLanes());

    harness.boardModifiers.archiveLaneItems([0]);

    expect(harness.board().children.map((l) => l.data.title)).toEqual(['Todo', 'Doing', 'Done']);
    expect(boardShape(harness.board()).Todo).toEqual([]);
    expect(harness.board().data.archive.map((i) => i.data.titleRaw)).toEqual(['One', 'Two']);
  });

  it('stamps the archive date on the card when archive-with-date is on', async () => {
    const harness = await loadBoard(threeLanes(), {
      'archive-with-date': true,
      'archive-date-format': 'YYYY-MM-DD',
      'archive-date-separator': '-',
    });

    harness.boardModifiers.archiveItem([0, 0]);

    expect(harness.board().data.archive[0].data.titleRaw).toMatch(/^\d{4}-\d{2}-\d{2} - One$/);
  });

  it('puts the archive date after the title when append-archive-date is on', async () => {
    const harness = await loadBoard(threeLanes(), {
      'archive-with-date': true,
      'archive-date-format': 'YYYY-MM-DD',
      'append-archive-date': true,
    });

    harness.boardModifiers.archiveItem([0, 0]);

    expect(harness.board().data.archive[0].data.titleRaw).toMatch(/^One \d{4}-\d{2}-\d{2}$/);
  });
});

describe('archive completed cards', () => {
  it('archives ticked cards and everything in a complete list', async () => {
    const harness = await loadBoard(
      wrapBoard([
        '## Todo',
        '',
        '- [ ] Open',
        '- [x] Ticked',
        '',
        '## Done',
        '',
        '**Complete**',
        '- [x] Old one',
        '- [ ] Not even ticked',
      ])
    );

    await harness.stateManager.archiveCompletedCards();

    expect(boardShape(harness.board())).toEqual({ Todo: ['Open'], Done: [] });
    expect(harness.board().data.archive.map((i) => i.data.titleRaw)).toEqual([
      'Ticked',
      'Old one',
      'Not even ticked',
    ]);
    expect(harness.markdown()).toMatch(/## Archive\n\n- \[x\] Ticked/);
  });
});
