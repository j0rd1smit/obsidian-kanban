import { LaneSort } from 'src/components/types';
import {
  DEFAULT_DONE_LANE_NAME,
  autoMoveDoneItem,
  autoMoveExternallyCompletedItems,
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

describe('autoMoveExternallyCompletedItems', () => {
  /**
   * Two parses of the same board, so cards keep their ids the way the diff/patch
   * reparse keeps them. `chars` is the checkbox character per card id, and a card
   * given a title takes that instead — a Dataview tick rewrites the line as well
   * as the checkbox.
   */
  function parse(
    chars: Record<string, string> = {},
    titles: Record<string, string> = {}
  ): ReturnType<typeof makeBoard> {
    const card = (id: string, title: string, checkChar: string = ' ') =>
      makeItem(titles[id] ?? title, chars[id] ?? checkChar, id);

    return makeBoard([
      makeLane('Todo', [card('a', 'write tests'), card('b', 'write docs')]),
      makeLane('Doing', [card('c', 'build the thing')]),
      makeLane('Done', [card('d', 'older finished thing', 'x')]),
    ]);
  }

  it('moves a card that was ticked outside the board', () => {
    const next = autoMoveExternallyCompletedItems(
      parse(),
      parse({ c: 'x' }, { c: 'build the thing [completion:: 2026-08-12]' }),
      enabled
    );

    expect(boardShape(next)).toEqual({
      Todo: ['write tests', 'write docs'],
      Doing: [],
      Done: ['older finished thing', 'build the thing [completion:: 2026-08-12]'],
    });
  });

  it('returns the parsed board itself when nothing was completed', () => {
    const parsed = parse();
    expect(autoMoveExternallyCompletedItems(parse(), parsed, enabled)).toBe(parsed);
  });

  it('leaves a card that was already complete where it is', () => {
    // complete in both parses: nothing happened, it just lives outside Done
    const previous = parse({ b: 'x' });
    const parsed = parse({ b: 'x' });

    expect(autoMoveExternallyCompletedItems(previous, parsed, enabled)).toBe(parsed);
  });

  it('leaves a card that is new to this parse alone', () => {
    const previous = parse();
    const parsed = makeBoard([
      makeLane('Todo', [makeItem('typed in by hand', 'x', 'new')]),
      makeLane('Done', [makeItem('older finished thing', 'x', 'd')]),
    ]);

    expect(boardShape(autoMoveExternallyCompletedItems(previous, parsed, enabled))).toEqual({
      Todo: ['typed in by hand'],
      Done: ['older finished thing'],
    });
  });

  it('moves every card completed in the same edit', () => {
    const next = autoMoveExternallyCompletedItems(parse(), parse({ a: 'x', c: 'x' }), enabled);

    expect(boardShape(next)).toEqual({
      Todo: ['write docs'],
      Doing: [],
      Done: ['older finished thing', 'write tests', 'build the thing'],
    });
  });

  it('ignores a card checked into a non-done status', () => {
    const parsed = parse({ c: '/' });
    expect(autoMoveExternallyCompletedItems(parse(), parsed, enabled)).toBe(parsed);
  });

  it('ignores a card that was unchecked outside the board', () => {
    const parsed = parse({ d: ' ' });
    expect(autoMoveExternallyCompletedItems(parse(), parsed, enabled)).toBe(parsed);
  });

  it('ignores a card completed inside the done lane', () => {
    const previous = parse({ d: ' ' });
    const parsed = parse();

    expect(autoMoveExternallyCompletedItems(previous, parsed, enabled)).toBe(parsed);
  });

  it('does nothing on the first parse, when there is no previous board', () => {
    const parsed = parse({ c: 'x' });
    expect(autoMoveExternallyCompletedItems(undefined, parsed, enabled)).toBe(parsed);
  });

  it('does nothing when the feature is off', () => {
    const parsed = parse({ c: 'x' });

    expect(autoMoveExternallyCompletedItems(parse(), parsed, { ...enabled, enabled: false })).toBe(
      parsed
    );
  });

  it('does nothing when no lane matches the configured name', () => {
    const parsed = parse({ c: 'x' });

    expect(
      autoMoveExternallyCompletedItems(parse(), parsed, { enabled: true, laneName: 'Finished' })
    ).toBe(parsed);
  });

  it('leaves the parsed board untouched', () => {
    const parsed = parse({ c: 'x' });

    autoMoveExternallyCompletedItems(parse(), parsed, enabled);

    expect(boardShape(parsed).Doing).toEqual(['build the thing']);
  });

  it('clears the sort flag on the done lane', () => {
    const previous = makeBoard([
      makeLane('Todo', [makeItem('a', ' ', 'a')]),
      makeLane('Done', [makeItem('b', 'x', 'b')], { sorted: LaneSort.TitleAsc }),
    ]);
    const parsed = makeBoard([
      makeLane('Todo', [makeItem('a', 'x', 'a')]),
      makeLane('Done', [makeItem('b', 'x', 'b')], { sorted: LaneSort.TitleAsc }),
    ]);

    const next = autoMoveExternallyCompletedItems(previous, parsed, enabled);

    expect(next.children[1].data.sorted).toBeUndefined();
    expect(boardShape(next)).toEqual({ Todo: [], Done: ['b', 'a'] });
  });

  it('honours the insertion method', () => {
    const next = autoMoveExternallyCompletedItems(parse(), parse({ c: 'x' }), {
      ...enabled,
      insertionMethod: 'prepend',
    });

    expect(boardShape(next).Done).toEqual(['build the thing', 'older finished thing']);
  });
});
