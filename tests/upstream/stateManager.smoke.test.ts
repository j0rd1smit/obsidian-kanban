/**
 * Upstream behaviour guard: the state manager's write path and reparse.
 *
 * Two things here are easy to break and hard to notice. Reparsing a board after
 * an external edit patches the existing tree instead of replacing it, which is
 * the only reason card ids — and with them drag state, edit state and DOM
 * identity — survive. And a board that failed to parse must never be written
 * back over the user's file.
 */
import { describe, expect, it } from 'vitest';

import { wrapBoard } from '../helpers/boards';
import { loadBoard } from '../helpers/harness';

function ids(harness: { board: () => any }) {
  return harness
    .board()
    .children.map((lane: any) => [lane.id, lane.children.map((item: any) => item.id)]);
}

const md = wrapBoard(['## Todo', '', '- [ ] One', '- [ ] Two', '', '## Doing', '', '- [ ] Three']);

describe('reparsing after an external edit', () => {
  it('keeps every id when the file has not changed', async () => {
    const harness = await loadBoard(md);
    const before = ids(harness);

    harness.stateManager.setState(harness.stateManager.getParsedBoard(md), false);

    expect(ids(harness)).toEqual(before);
  });

  it('keeps the ids of the cards an edit did not touch', async () => {
    const harness = await loadBoard(md);
    const before = ids(harness);

    const edited = md.replace('- [ ] Two', '- [ ] Two, edited elsewhere');
    harness.stateManager.setState(harness.stateManager.getParsedBoard(edited), false);

    expect(harness.board().children[0].children[1].data.titleRaw).toBe('Two, edited elsewhere');
    expect(ids(harness)).toEqual(before);
  });

  it('re-derives metadata for a card whose text changed', async () => {
    const harness = await loadBoard(md);

    const edited = md.replace('- [ ] Two', '- [ ] Two #urgent @{2026-08-07}');
    harness.stateManager.setState(harness.stateManager.getParsedBoard(edited), false);

    const item = harness.board().children[0].children[1];
    expect(item.data.metadata.tags).toEqual(['#urgent']);
    expect(item.data.metadata.date.format('YYYY-MM-DD')).toBe('2026-08-07');
  });

  it('picks up a card added outside the app', async () => {
    const harness = await loadBoard(md);

    const edited = md.replace('- [ ] Two', '- [ ] Two\n- [ ] Two and a half');
    harness.stateManager.setState(harness.stateManager.getParsedBoard(edited), false);

    expect(harness.board().children[0].children.map((i) => i.data.titleRaw)).toEqual([
      'One',
      'Two',
      'Two and a half',
    ]);
  });
});

describe('writing to disk', () => {
  it('writes on every state change', async () => {
    const harness = await loadBoard(md);

    expect(harness.view.saved).toHaveLength(0);
    harness.stateManager.setState((b) => b);
    expect(harness.view.saved).toHaveLength(1);
  });

  it('does not write when the caller asks it not to', async () => {
    const harness = await loadBoard(md);

    harness.stateManager.setState((b) => b, false);

    expect(harness.view.saved).toHaveLength(0);
  });

  it('refuses to write a board that has errors', async () => {
    const harness = await loadBoard(md);

    harness.stateManager.setError(new Error('something went wrong'));
    harness.stateManager.setState((b) => b);

    expect(harness.errors()).toEqual(['Error: something went wrong']);
    expect(harness.view.saved).toEqual([]);
  });

  it('hands the same markdown to the view it holds as its own data', async () => {
    const harness = await loadBoard(md);

    harness.stateManager.setState((b) => b);

    expect(harness.view.data).toBe(harness.markdown());
  });
});

describe('creating cards', () => {
  it('parses a new card the same way the file would have', async () => {
    const harness = await loadBoard(md);
    const item = harness.stateManager.getNewItem('Fresh #tag @{2026-08-07}', ' ');

    expect(item.data.titleRaw).toBe('Fresh #tag @{2026-08-07}');
    expect(item.data.checked).toBe(false);
    expect(item.data.metadata.tags).toEqual(['#tag']);
    expect(item.data.metadata.date.format('YYYY-MM-DD')).toBe('2026-08-07');
  });

  it('creates a ticked card when asked for one', async () => {
    const harness = await loadBoard(md);
    const item = harness.stateManager.getNewItem('Already done', 'x');

    expect(item.data.checked).toBe(true);
    expect(item.data.checkChar).toBe('x');
  });

  it('keeps the id when a card is edited in place', async () => {
    const harness = await loadBoard(md);
    const item = harness.board().children[0].children[0];
    const updated = harness.stateManager.updateItemContent(item, 'One, rewritten');

    expect(updated.id).toBe(item.id);
    expect(updated.data.titleRaw).toBe('One, rewritten');
  });
});
