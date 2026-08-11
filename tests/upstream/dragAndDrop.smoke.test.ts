/**
 * Upstream behaviour guard: moving cards and lists.
 *
 * Drag and drop is the plugin's headline feature and its most fragile: the drop
 * handler does a merged remove+insert with an off-by-one adjustment for
 * siblings, and flips a card's checkbox when it crosses into or out of a
 * complete list. The pointer half can't be tested headlessly; the state half —
 * `moveEntity`, `maybeCompleteForMove`, the path arithmetic — is what breaks.
 *
 * See `tests/helpers/drop.ts` for how a drop is reproduced here.
 */
import { LaneSort } from 'src/components/types';
import { describe, expect, it } from 'vitest';

import { wrapBoard } from '../helpers/boards';
import { drop } from '../helpers/drop';
import { boardShape } from '../helpers/fixtures';
import { loadBoard } from '../helpers/harness';

function board() {
  return wrapBoard([
    '## Todo',
    '',
    '- [ ] One',
    '- [ ] Two',
    '- [ ] Three',
    '',
    '## Doing',
    '',
    '- [ ] Four',
    '',
    '## Done',
    '',
    '**Complete**',
    '- [x] Five',
  ]);
}

describe('moving a card', () => {
  it('moves it to another lane', async () => {
    const harness = await loadBoard(board());

    drop(harness.stateManager, harness.view, [0, 0], [1, 0]);

    expect(boardShape(harness.board())).toMatchObject({
      Todo: ['Two', 'Three'],
      Doing: ['One', 'Four'],
    });
    expect(harness.markdown()).toMatch(/## Doing\n\n- \[ \] One\n- \[ \] Four/);
  });

  it('moves it within its own lane, accounting for the insertion index', async () => {
    const harness = await loadBoard(board());

    // dropping "One" at index 2 lands it between Two and Three
    drop(harness.stateManager, harness.view, [0, 0], [0, 2]);

    expect(boardShape(harness.board()).Todo).toEqual(['Two', 'One', 'Three']);
  });

  it('moves it backwards within its lane', async () => {
    const harness = await loadBoard(board());

    drop(harness.stateManager, harness.view, [0, 2], [0, 0]);

    expect(boardShape(harness.board()).Todo).toEqual(['Three', 'One', 'Two']);
  });

  it('drops it onto an empty area of a lane', async () => {
    const harness = await loadBoard(board());

    drop(harness.stateManager, harness.view, [0, 0], [1], { inDropArea: true });

    expect(boardShape(harness.board()).Doing).toEqual(['One', 'Four']);
  });

  it('ticks it off when it lands in a complete lane', async () => {
    const harness = await loadBoard(board());

    drop(harness.stateManager, harness.view, [0, 0], [2, 1]);

    const moved = harness.board().children[2].children[1];
    expect(moved.data.checked).toBe(true);
    expect(moved.data.checkChar).toBe('x');
    expect(harness.markdown()).toMatch(/## Done\n\n\*\*Complete\*\*\n- \[x\] Five\n- \[x\] One/);
  });

  it('un-ticks it when it leaves a complete lane', async () => {
    const harness = await loadBoard(board());

    drop(harness.stateManager, harness.view, [2, 0], [0, 0]);

    const moved = harness.board().children[0].children[0];
    expect(moved.data.titleRaw).toBe('Five');
    expect(moved.data.checked).toBe(false);
    expect(moved.data.checkChar).toBe(' ');
    expect(harness.markdown()).toContain('- [ ] Five');
  });

  it('leaves the checkbox alone when neither lane is a complete lane', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo', '', '- [x] Already ticked', '', '## Doing'])
    );

    drop(harness.stateManager, harness.view, [0, 0], [1, 0]);

    expect(harness.board().children[1].children[0].data.checked).toBe(true);
  });

  it('clears the destination lane sort so the drop is not undone', async () => {
    const harness = await loadBoard(board());

    harness.stateManager.setState((b) => {
      const lane = b.children[1];
      return {
        ...b,
        children: b.children.map((l, i) =>
          i === 1 ? { ...lane, data: { ...lane.data, sorted: LaneSort.TitleAsc } } : l
        ),
      };
    });
    expect(harness.board().children[1].data.sorted).toBe(LaneSort.TitleAsc);

    drop(harness.stateManager, harness.view, [0, 0], [1, 0]);

    expect(harness.board().children[1].data.sorted).toBeUndefined();
  });
});

describe('moving a lane', () => {
  it('reorders the board', async () => {
    const harness = await loadBoard(board());

    drop(harness.stateManager, harness.view, [0], [2]);

    expect(harness.board().children.map((l) => l.data.title)).toEqual(['Doing', 'Todo', 'Done']);
    expect(harness.markdown().indexOf('## Doing')).toBeLessThan(
      harness.markdown().indexOf('## Todo')
    );
  });

  it('carries its cards and its collapsed state with it', async () => {
    const harness = await loadBoard(board());

    harness.view.setViewState('list-collapse', [true, false, false]);
    drop(harness.stateManager, harness.view, [0], [2]);

    expect(boardShape(harness.board()).Todo).toEqual(['One', 'Two', 'Three']);
    expect(harness.view.getViewState('list-collapse')).toEqual([false, true, false]);
  });
});
