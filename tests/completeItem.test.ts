import { LaneSort } from 'src/components/types';
import {
  DEFAULT_DONE_LANE_NAME,
  autoMoveCompletedItems,
  autoMoveDoneItem,
  findLaneIndexByTitle,
  isItemComplete,
} from 'src/helpers/completeItem';
import { beforeEach, describe, expect, it } from 'vitest';

import { boardShape, makeBoard, makeItem, makeLane, resetIds } from './helpers/fixtures';

const enabled = { enabled: true, laneName: DEFAULT_DONE_LANE_NAME };

function threeLaneBoard() {
  return makeBoard([
    makeLane('Todo', [makeItem('write tests'), makeItem('write docs')]),
    makeLane('Doing', [makeItem('build the thing')]),
    makeLane('Done', [makeItem('older finished thing', 'x')], { shouldMarkItemsComplete: true }),
  ]);
}

beforeEach(() => {
  resetIds();
});

describe('findLaneIndexByTitle', () => {
  it('finds a lane by exact title', () => {
    expect(findLaneIndexByTitle(threeLaneBoard(), 'Done')).toBe(2);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(findLaneIndexByTitle(threeLaneBoard(), '  dOnE ')).toBe(2);
  });

  it('returns -1 when nothing matches', () => {
    expect(findLaneIndexByTitle(threeLaneBoard(), 'Complete')).toBe(-1);
  });

  it('returns -1 for an empty name', () => {
    expect(findLaneIndexByTitle(threeLaneBoard(), '')).toBe(-1);
    expect(findLaneIndexByTitle(threeLaneBoard(), '   ')).toBe(-1);
    expect(findLaneIndexByTitle(threeLaneBoard(), undefined)).toBe(-1);
  });

  it('matches a lane whose title carries a WIP limit', () => {
    // parseLaneTitle strips the `(n)` suffix into maxItems before this point
    const board = makeBoard([makeLane('Todo'), makeLane('Done', [], { maxItems: 5 })]);
    expect(findLaneIndexByTitle(board, 'Done')).toBe(1);
  });

  it('takes the first match when lanes share a title', () => {
    const board = makeBoard([makeLane('Done'), makeLane('Todo'), makeLane('Done')]);
    expect(findLaneIndexByTitle(board, 'Done')).toBe(0);
  });
});

describe('isItemComplete', () => {
  it('is true only for a checked card carrying the done status', () => {
    expect(isItemComplete(makeItem('a', 'x'))).toBe(true);
    expect(isItemComplete(makeItem('a', ' '))).toBe(false);
    // in progress: checked, but not the done character
    expect(isItemComplete(makeItem('a', '/'))).toBe(false);
    expect(isItemComplete(undefined)).toBe(false);
  });
});

describe('autoMoveDoneItem', () => {
  it('moves a completed card to the done lane', () => {
    const board = threeLaneBoard();
    const completed = makeItem('write tests ✅ 2026-08-07', 'x');

    const next = autoMoveDoneItem(board, [0, 0], [completed], 0, enabled);

    expect(boardShape(next)).toEqual({
      Todo: ['write docs'],
      Doing: ['build the thing'],
      Done: ['older finished thing', 'write tests ✅ 2026-08-07'],
    });
  });

  it('leaves the original board untouched', () => {
    const board = threeLaneBoard();

    autoMoveDoneItem(board, [0, 0], [makeItem('write tests', 'x')], 0, enabled);

    expect(boardShape(board)).toEqual({
      Todo: ['write tests', 'write docs'],
      Doing: ['build the thing'],
      Done: ['older finished thing'],
    });
  });

  it('prepends when the board prepends new cards', () => {
    const board = threeLaneBoard();
    const completed = makeItem('write tests', 'x');

    const next = autoMoveDoneItem(board, [0, 0], [completed], 0, {
      ...enabled,
      insertionMethod: 'prepend',
    });

    expect(boardShape(next).Done).toEqual(['write tests', 'older finished thing']);
  });

  it('appends by default', () => {
    const board = threeLaneBoard();
    const next = autoMoveDoneItem(board, [0, 0], [makeItem('write tests', 'x')], 0, enabled);

    expect(boardShape(next).Done).toEqual(['older finished thing', 'write tests']);
  });

  it('honours a custom lane name', () => {
    const board = makeBoard([
      makeLane('Backlog', [makeItem('a')]),
      makeLane('Afgerond', [makeItem('b', 'x')]),
    ]);

    const next = autoMoveDoneItem(board, [0, 0], [makeItem('a', 'x')], 0, {
      enabled: true,
      laneName: 'afgerond',
    });

    expect(boardShape(next)).toEqual({ Backlog: [], Afgerond: ['b', 'a'] });
  });

  it('does nothing when the feature is off', () => {
    const board = threeLaneBoard();

    const next = autoMoveDoneItem(board, [0, 0], [makeItem('write tests', 'x')], 0, {
      ...enabled,
      enabled: false,
    });

    expect(boardShape(next)).toEqual({
      Todo: ['write tests', 'write docs'],
      Doing: ['build the thing'],
      Done: ['older finished thing'],
    });
  });

  it('does nothing when no lane matches the configured name', () => {
    const board = threeLaneBoard();

    const next = autoMoveDoneItem(board, [0, 0], [makeItem('write tests', 'x')], 0, {
      enabled: true,
      laneName: 'Finished',
    });

    expect(boardShape(next).Todo).toEqual(['write tests', 'write docs']);
    expect(boardShape(next).Done).toEqual(['older finished thing']);
  });

  it('does nothing when the card is already in the done lane', () => {
    const board = threeLaneBoard();

    const next = autoMoveDoneItem(
      board,
      [2, 0],
      [makeItem('older finished thing', 'x')],
      0,
      enabled
    );

    expect(boardShape(next).Done).toEqual(['older finished thing']);
  });

  it('does not move a card that was just unchecked', () => {
    const board = threeLaneBoard();

    const next = autoMoveDoneItem(board, [1, 0], [makeItem('build the thing', ' ')], 0, enabled);

    expect(boardShape(next)).toEqual({
      Todo: ['write tests', 'write docs'],
      Doing: ['build the thing'],
      Done: ['older finished thing'],
    });
  });

  it('does not move a card checked into a non-done status', () => {
    const board = threeLaneBoard();

    const next = autoMoveDoneItem(board, [1, 0], [makeItem('build the thing', '/')], 0, enabled);

    expect(boardShape(next).Doing).toEqual(['build the thing']);
    expect(boardShape(next).Done).toEqual(['older finished thing']);
  });

  it('keeps the checkbox change when nothing moves', () => {
    const board = threeLaneBoard();

    const next = autoMoveDoneItem(board, [1, 0], [makeItem('build the thing', '/')], 0, enabled);

    expect(next.children[1].children[0].data.checkChar).toBe('/');
  });

  it('preserves position of the remaining cards in the source lane', () => {
    const board = threeLaneBoard();

    const next = autoMoveDoneItem(board, [0, 1], [makeItem('write docs', 'x')], 0, enabled);

    expect(boardShape(next).Todo).toEqual(['write tests']);
  });

  describe('recurring tasks', () => {
    // What the Tasks plugin hands back: the next occurrence plus the completed
    // one. `completedIndex` points at the completed occurrence.
    const recurrence = () => [
      makeItem('water plants 🔁 every week 📅 2026-08-14', ' '),
      makeItem('water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07', 'x'),
    ];

    it('moves the completed occurrence and leaves the new one behind', () => {
      const board = threeLaneBoard();

      const next = autoMoveDoneItem(board, [0, 0], recurrence(), 1, enabled);

      expect(boardShape(next)).toEqual({
        Todo: ['water plants 🔁 every week 📅 2026-08-14', 'write docs'],
        Doing: ['build the thing'],
        Done: ['older finished thing', 'water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07'],
      });
    });

    it('keeps the new occurrence at the completed card position', () => {
      const board = threeLaneBoard();

      const next = autoMoveDoneItem(board, [0, 1], recurrence(), 1, enabled);

      expect(boardShape(next).Todo).toEqual([
        'write tests',
        'water plants 🔁 every week 📅 2026-08-14',
      ]);
    });

    it('handles the completed occurrence coming first', () => {
      // Tasks' `recurrenceOnNextLine` setting flips the order
      const board = threeLaneBoard();
      const items = recurrence().reverse();

      const next = autoMoveDoneItem(board, [0, 0], items, 0, enabled);

      expect(boardShape(next).Todo).toEqual([
        'water plants 🔁 every week 📅 2026-08-14',
        'write docs',
      ]);
      expect(boardShape(next).Done).toEqual([
        'older finished thing',
        'water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07',
      ]);
    });

    it('keeps both occurrences in place when the feature is off', () => {
      const board = threeLaneBoard();

      const next = autoMoveDoneItem(board, [0, 0], recurrence(), 1, {
        ...enabled,
        enabled: false,
      });

      expect(boardShape(next).Todo).toEqual([
        'water plants 🔁 every week 📅 2026-08-14',
        'water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07',
        'write docs',
      ]);
    });

    describe('routing the new occurrence to its own lane', () => {
      const routed = { ...enabled, recurringEnabled: true, recurringLaneName: 'Recurring' };

      const fourLaneBoard = () =>
        makeBoard([
          makeLane('Todo', [makeItem('write tests'), makeItem('write docs')]),
          makeLane('Doing', [makeItem('build the thing')]),
          makeLane('Done', [makeItem('older finished thing', 'x')], {
            shouldMarkItemsComplete: true,
          }),
          makeLane('Recurring', [makeItem('take out the bins')]),
        ]);

      it('sends the new occurrence to the recurring lane', () => {
        const next = autoMoveDoneItem(fourLaneBoard(), [0, 0], recurrence(), 1, routed);

        expect(boardShape(next)).toEqual({
          Todo: ['write docs'],
          Doing: ['build the thing'],
          Done: ['older finished thing', 'water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07'],
          Recurring: ['take out the bins', 'water plants 🔁 every week 📅 2026-08-14'],
        });
      });

      it('routes the new occurrence with the completed card move off', () => {
        const next = autoMoveDoneItem(fourLaneBoard(), [0, 0], recurrence(), 1, {
          ...routed,
          enabled: false,
        });

        expect(boardShape(next)).toEqual({
          Todo: ['water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07', 'write docs'],
          Doing: ['build the thing'],
          Done: ['older finished thing'],
          Recurring: ['take out the bins', 'water plants 🔁 every week 📅 2026-08-14'],
        });
      });

      it('handles the completed occurrence coming first', () => {
        const next = autoMoveDoneItem(fourLaneBoard(), [0, 0], recurrence().reverse(), 0, routed);

        expect(boardShape(next).Recurring).toEqual([
          'take out the bins',
          'water plants 🔁 every week 📅 2026-08-14',
        ]);
      });

      it('prepends when the board prepends new cards', () => {
        const next = autoMoveDoneItem(fourLaneBoard(), [0, 0], recurrence(), 1, {
          ...routed,
          insertionMethod: 'prepend',
        });

        expect(boardShape(next).Recurring).toEqual([
          'water plants 🔁 every week 📅 2026-08-14',
          'take out the bins',
        ]);
      });

      it('leaves the new occurrence behind when no lane matches the name', () => {
        const next = autoMoveDoneItem(threeLaneBoard(), [0, 0], recurrence(), 1, routed);

        expect(boardShape(next).Todo).toEqual([
          'water plants 🔁 every week 📅 2026-08-14',
          'write docs',
        ]);
      });

      it('leaves it alone when the card already sits in the recurring lane', () => {
        const next = autoMoveDoneItem(fourLaneBoard(), [3, 0], recurrence(), 1, routed);

        expect(boardShape(next)).toEqual({
          Todo: ['write tests', 'write docs'],
          Doing: ['build the thing'],
          Done: ['older finished thing', 'water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07'],
          Recurring: ['water plants 🔁 every week 📅 2026-08-14'],
        });
      });

      it('does nothing for a card that did not split', () => {
        const next = autoMoveDoneItem(
          fourLaneBoard(),
          [0, 0],
          [makeItem('write tests', 'x')],
          0,
          routed
        );

        expect(boardShape(next).Recurring).toEqual(['take out the bins']);
        expect(boardShape(next).Done).toEqual(['older finished thing', 'write tests']);
      });

      it('does not route anything when the card was just unchecked', () => {
        const next = autoMoveDoneItem(
          fourLaneBoard(),
          [2, 0],
          [makeItem('older finished thing', ' ')],
          0,
          routed
        );

        expect(boardShape(next)).toEqual({
          Todo: ['write tests', 'write docs'],
          Doing: ['build the thing'],
          Done: ['older finished thing'],
          Recurring: ['take out the bins'],
        });
      });

      it('handles a recurring lane that sits before the source lane', () => {
        const board = makeBoard([
          makeLane('Recurring', [makeItem('take out the bins')]),
          makeLane('Todo', [makeItem('write tests'), makeItem('write docs')]),
          makeLane('Done', [makeItem('older finished thing', 'x')]),
        ]);

        const next = autoMoveDoneItem(board, [1, 0], recurrence(), 1, routed);

        expect(boardShape(next)).toEqual({
          Recurring: ['take out the bins', 'water plants 🔁 every week 📅 2026-08-14'],
          Todo: ['write docs'],
          Done: ['older finished thing', 'water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07'],
        });
      });

      it('puts both cards in one lane when both settings name it', () => {
        const next = autoMoveDoneItem(fourLaneBoard(), [0, 0], recurrence(), 1, {
          ...routed,
          recurringLaneName: DEFAULT_DONE_LANE_NAME,
        });

        expect(boardShape(next)).toEqual({
          Todo: ['write docs'],
          Doing: ['build the thing'],
          Done: [
            'older finished thing',
            'water plants 🔁 every week 📅 2026-08-07 ✅ 2026-08-07',
            'water plants 🔁 every week 📅 2026-08-14',
          ],
          Recurring: ['take out the bins'],
        });
      });

      it('clears the sort flag on the recurring lane', () => {
        const board = makeBoard([
          makeLane('Todo', [makeItem('write tests')]),
          makeLane('Done', [makeItem('older finished thing', 'x')]),
          makeLane('Recurring', [makeItem('take out the bins')], { sorted: LaneSort.TitleAsc }),
        ]);

        const next = autoMoveDoneItem(board, [0, 0], recurrence(), 1, routed);

        expect(next.children[2].data.sorted).toBeUndefined();
        expect(boardShape(next).Recurring).toEqual([
          'take out the bins',
          'water plants 🔁 every week 📅 2026-08-14',
        ]);
      });

      it('leaves the board it was given untouched', () => {
        const board = fourLaneBoard();

        autoMoveDoneItem(board, [0, 0], recurrence(), 1, routed);

        expect(boardShape(board)).toEqual({
          Todo: ['write tests', 'write docs'],
          Doing: ['build the thing'],
          Done: ['older finished thing'],
          Recurring: ['take out the bins'],
        });
      });
    });
  });

  it('clears the sort flag on the done lane so the card stays put', () => {
    const board = makeBoard([
      makeLane('Todo', [makeItem('a')]),
      makeLane('Done', [makeItem('b', 'x')], { sorted: LaneSort.TitleAsc }),
    ]);

    const next = autoMoveDoneItem(board, [0, 0], [makeItem('a', 'x')], 0, enabled);

    expect(next.children[1].data.sorted).toBeUndefined();
    expect(boardShape(next).Done).toEqual(['b', 'a']);
  });

  it('leaves an unsorted done lane alone', () => {
    const board = threeLaneBoard();
    const next = autoMoveDoneItem(board, [0, 0], [makeItem('write tests', 'x')], 0, enabled);

    expect('sorted' in next.children[2].data).toBe(false);
  });

  it('moves into a done lane that sits before the source lane', () => {
    const board = makeBoard([
      makeLane('Done', [makeItem('b', 'x')]),
      makeLane('Todo', [makeItem('a'), makeItem('c')]),
    ]);

    const next = autoMoveDoneItem(board, [1, 0], [makeItem('a', 'x')], 0, enabled);

    expect(boardShape(next)).toEqual({ Done: ['b', 'a'], Todo: ['c'] });
  });

  it('moves into an empty done lane', () => {
    const board = makeBoard([makeLane('Todo', [makeItem('a')]), makeLane('Done')]);

    const next = autoMoveDoneItem(board, [0, 0], [makeItem('a', 'x')], 0, enabled);

    expect(boardShape(next)).toEqual({ Todo: [], Done: ['a'] });
  });
});

describe('autoMoveCompletedItems', () => {
  it('moves a complete card that sits outside the done lane', () => {
    const board = makeBoard([
      makeLane('Todo', [makeItem('write tests'), makeItem('write docs', 'x')]),
      makeLane('Done', [makeItem('older finished thing', 'x')]),
    ]);

    expect(boardShape(autoMoveCompletedItems(board, enabled))).toEqual({
      Todo: ['write tests'],
      Done: ['older finished thing', 'write docs'],
    });
  });

  it('moves every misplaced card, in board order', () => {
    const board = makeBoard([
      makeLane('Todo', [makeItem('a', 'x'), makeItem('b')]),
      makeLane('Doing', [makeItem('c', 'x')]),
      makeLane('Done', [makeItem('d', 'x')]),
    ]);

    expect(boardShape(autoMoveCompletedItems(board, enabled))).toEqual({
      Todo: ['b'],
      Doing: [],
      Done: ['d', 'a', 'c'],
    });
  });

  it('returns the board itself when the invariant already holds', () => {
    const board = threeLaneBoard();
    expect(autoMoveCompletedItems(board, enabled)).toBe(board);
  });

  it('leaves a list marked **Complete** alone', () => {
    // its cards are complete because of the list, not because anyone ticked them
    const board = makeBoard([
      makeLane('Archive', [makeItem('shipped', 'x')], { shouldMarkItemsComplete: true }),
      makeLane('Done', [makeItem('older finished thing', 'x')]),
    ]);

    expect(autoMoveCompletedItems(board, enabled)).toBe(board);
  });

  it('ignores cards checked into a non-done status', () => {
    const board = makeBoard([
      makeLane('Doing', [makeItem('in progress', '/')]),
      makeLane('Done', []),
    ]);

    expect(autoMoveCompletedItems(board, enabled)).toBe(board);
  });

  it('does nothing when the feature is off', () => {
    const board = makeBoard([makeLane('Todo', [makeItem('a', 'x')]), makeLane('Done', [])]);

    expect(autoMoveCompletedItems(board, { ...enabled, enabled: false })).toBe(board);
  });

  it('does nothing when no lane matches the configured name', () => {
    const board = makeBoard([makeLane('Todo', [makeItem('a', 'x')]), makeLane('Done', [])]);

    expect(autoMoveCompletedItems(board, { enabled: true, laneName: 'Finished' })).toBe(board);
  });

  it('leaves the board it was given untouched', () => {
    const board = makeBoard([makeLane('Todo', [makeItem('a', 'x')]), makeLane('Done', [])]);

    autoMoveCompletedItems(board, enabled);

    expect(boardShape(board)).toEqual({ Todo: ['a'], Done: [] });
  });

  it('honours the insertion method', () => {
    const board = makeBoard([
      makeLane('Todo', [makeItem('a', 'x')]),
      makeLane('Done', [makeItem('b', 'x')]),
    ]);

    const next = autoMoveCompletedItems(board, { ...enabled, insertionMethod: 'prepend' });

    expect(boardShape(next).Done).toEqual(['a', 'b']);
  });

  it('clears the sort flag on the done lane', () => {
    const board = makeBoard([
      makeLane('Todo', [makeItem('a', 'x')]),
      makeLane('Done', [makeItem('b', 'x')], { sorted: LaneSort.TitleAsc }),
    ]);

    const next = autoMoveCompletedItems(board, enabled);

    expect(next.children[1].data.sorted).toBeUndefined();
    expect(boardShape(next)).toEqual({ Todo: [], Done: ['b', 'a'] });
  });
});
