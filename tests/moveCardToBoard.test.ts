import {
  findOpenStateManager,
  getDestinationLanes,
  listKanbanBoards,
  moveCardToBoard,
} from 'src/helpers/moveCardToBoard';
import { afterEach, describe, expect, it } from 'vitest';

import { wrapBoard } from './helpers/boards';
import { FakeKanbanView, Harness, loadBoard } from './helpers/harness';
import { TFile } from './mocks/obsidian';

/**
 * Moving a card to another board, over the real state manager and serializer.
 *
 * The two write paths are covered separately: a destination board that is open
 * (a `StateManager` of its own) and one that is not (a file on disk).
 */

const SOURCE = wrapBoard(['## Todo', '', '- [ ] Ship it', '- [ ] Later', '', '', '']);

const DESTINATION = wrapBoard([
  '## Backlog',
  '',
  '- [ ] Someday',
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
]);

const lane = (index: number, title: string, shouldMarkItemsComplete = false) => ({
  index,
  title,
  shouldMarkItemsComplete,
});

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

/** Backs `app.vault` with an in-memory set of files for the duration of a test. */
function fakeVault(files: Record<string, string>) {
  const vault = (globalThis as any).app.vault;
  const previous = { ...vault };

  vault.cachedRead = async (file: TFile) => files[file.path];
  vault.read = vault.cachedRead;
  vault.process = async (file: TFile, fn: (data: string) => string) => {
    files[file.path] = fn(files[file.path]);
    return files[file.path];
  };

  restore = () => Object.assign(vault, previous);

  return files;
}

function move(
  source: Harness,
  file: TFile,
  target: ReturnType<typeof lane>,
  destination?: Harness
) {
  const [laneIndex, itemIndex] = [0, 0];
  const item = source.board().children[laneIndex].children[itemIndex];

  return moveCardToBoard({
    stateManager: source.stateManager,
    path: [laneIndex, itemIndex],
    item,
    file: file as any,
    lane: target,
    destination: destination?.stateManager,
  });
}

describe('moving a card to a board that is open', () => {
  let source: Harness;
  let destination: Harness;

  const load = async () => {
    source = await loadBoard(SOURCE, {}, 'Source.md');
    destination = await loadBoard(DESTINATION, {}, 'Destination.md');
  };

  it('takes the card off the source board and appends it to the chosen list', async () => {
    await load();
    await move(source, destination.view.file, lane(0, 'Backlog'), destination);

    expect(source.board().children[0].children.map((i) => i.data.titleRaw)).toEqual(['Later']);
    expect(source.markdown()).not.toContain('Ship it');

    expect(destination.board().children[0].children.map((i) => i.data.titleRaw)).toEqual([
      'Someday',
      'Ship it',
    ]);
    expect(destination.markdown()).toContain('- [ ] Ship it');
  });

  it("honours the destination board's new-card-insertion-method", async () => {
    source = await loadBoard(SOURCE, {}, 'Source.md');
    destination = await loadBoard(
      wrapBoard(['## Backlog', '', '- [ ] Someday', '', '', ''], {
        'new-card-insertion-method': 'prepend',
      }),
      {},
      'Destination.md'
    );

    await move(source, destination.view.file, lane(0, 'Backlog'), destination);

    expect(destination.board().children[0].children.map((i) => i.data.titleRaw)).toEqual([
      'Ship it',
      'Someday',
    ]);
  });

  it('checks the card off when it lands in a list that marks cards complete', async () => {
    await load();
    await move(source, destination.view.file, lane(1, 'Done', true), destination);

    const moved = destination.board().children[1].children.at(-1);
    expect(moved.data.titleRaw).toBe('Ship it');
    expect(moved.data.checked).toBe(true);
    expect(destination.markdown()).toContain('- [x] Ship it');
  });

  it('leaves the card where it is when the list has gone', async () => {
    await load();

    await expect(
      move(source, destination.view.file, lane(7, 'Ghost'), destination)
    ).rejects.toThrow(/no longer has a list/);
    expect(source.board().children[0].children).toHaveLength(2);
  });

  // A board is open once, however many tabs, panes or windows show it:
  // `plugin.stateManagers` is keyed by file, and every view of that file shares
  // the one StateManager. Which tab the destination sits in is not a case.
  it('resolves the destination by file, whichever view has it open', async () => {
    await load();

    // The map plugin.addView() maintains: one StateManager per file, shared by
    // every view of it, whatever tab or window that view lives in
    (source.view as any).plugin = {
      stateManagers: new Map([
        [source.view.file, source.stateManager],
        [destination.view.file, destination.stateManager],
      ]),
    };

    expect(findOpenStateManager(source.stateManager, destination.view.file as any)).toBe(
      destination.stateManager
    );
    expect(
      findOpenStateManager(source.stateManager, new TFile('Closed.md') as any)
    ).toBeUndefined();
  });

  it('updates every view of the destination board, not just the primary one', async () => {
    await load();

    const secondTab = new FakeKanbanView(destination.view.file);
    secondTab.stateManager = destination.stateManager;
    await destination.stateManager.registerView(secondTab as any, DESTINATION, false);

    await move(source, destination.view.file, lane(0, 'Backlog'), destination);

    expect(secondTab.data).toContain('- [ ] Ship it');
    expect(secondTab.data).toBe(destination.view.data);
    // Only the primary view writes to disk
    expect(secondTab.saved).toEqual([]);
  });

  it("lists the open board's lists from its live state, not from disk", async () => {
    await load();
    destination.stateManager.setState((board) =>
      moveCardToBoardTestRename(board, 0, 'Renamed in memory')
    );

    const lanes = await getDestinationLanes(
      (globalThis as any).app,
      destination.view.file as any,
      destination.stateManager
    );

    expect(lanes).toEqual([
      lane(0, 'Renamed in memory'),
      { index: 1, title: 'Done', shouldMarkItemsComplete: true },
    ]);
  });
});

describe('moving a card to a board that is not open', () => {
  it('writes the card into the file and drops it from the source board', async () => {
    const files = fakeVault({ 'Destination.md': DESTINATION });
    const source = await loadBoard(SOURCE, {}, 'Source.md');

    await move(source, new TFile('Destination.md'), lane(0, 'Backlog'));

    expect(source.board().children[0].children.map((i) => i.data.titleRaw)).toEqual(['Later']);

    const written = files['Destination.md'].split('\n');
    expect(written.slice(written.indexOf('## Backlog'), written.indexOf('## Done'))).toEqual([
      '## Backlog',
      '',
      '- [ ] Someday',
      '- [ ] Ship it',
      '',
      '',
      '',
    ]);

    // The rest of the file is untouched
    expect(files['Destination.md'].replace('- [ ] Ship it\n', '')).toBe(DESTINATION);
  });

  it('checks the card off when the list in the file marks cards complete', async () => {
    const files = fakeVault({ 'Destination.md': DESTINATION });
    const source = await loadBoard(SOURCE, {}, 'Source.md');

    await move(source, new TFile('Destination.md'), lane(1, 'Done', true));

    expect(files['Destination.md']).toContain('- [x] Ship it');
  });

  it("reads the destination board's insertion method out of its own settings", async () => {
    const files = fakeVault({
      'Destination.md': wrapBoard(['## Backlog', '', '- [ ] Someday', '', '', ''], {
        'new-card-insertion-method': 'prepend',
      }),
    });
    const source = await loadBoard(SOURCE, {}, 'Source.md');

    await move(source, new TFile('Destination.md'), lane(0, 'Backlog'));

    const written = files['Destination.md'].split('\n');
    expect(written[written.indexOf('## Backlog') + 2]).toBe('- [ ] Ship it');
  });

  it('finds the list by title when it has moved since it was picked', async () => {
    const files = fakeVault({ 'Destination.md': DESTINATION });
    const source = await loadBoard(SOURCE, {}, 'Source.md');

    await move(source, new TFile('Destination.md'), lane(1, 'Backlog'));

    const written = files['Destination.md'].split('\n');
    expect(written.slice(written.indexOf('## Backlog'), written.indexOf('## Done'))).toContain(
      '- [ ] Ship it'
    );
  });

  it('keeps the card when the file has no such list', async () => {
    const files = fakeVault({ 'Destination.md': DESTINATION });
    const source = await loadBoard(SOURCE, {}, 'Source.md');

    await expect(move(source, new TFile('Destination.md'), lane(0, 'Ghost'))).rejects.toThrow(
      /no longer has a list/
    );

    expect(source.board().children[0].children).toHaveLength(2);
    expect(files['Destination.md']).toBe(DESTINATION);
  });

  it("lists a closed board's lists by reading it", async () => {
    fakeVault({ 'Destination.md': DESTINATION });

    expect(
      await getDestinationLanes((globalThis as any).app, new TFile('Destination.md') as any)
    ).toEqual([lane(0, 'Backlog'), lane(1, 'Done', true)]);
  });
});

describe('listKanbanBoards', () => {
  it('offers every other board in the vault, by path', () => {
    const boards = ['b/Two.md', 'a/One.md', 'Notes.md'].map((p) => new TFile(p));
    const app = (globalThis as any).app;
    const previous = { ...app.vault };

    app.vault.getMarkdownFiles = () => boards;
    app.metadataCache.getFileCache = (file: TFile) =>
      file.path === 'Notes.md' ? {} : { frontmatter: { 'kanban-plugin': 'board' } };
    restore = () => {
      Object.assign(app.vault, previous);
      app.metadataCache.getFileCache = (): any => null;
    };

    expect(listKanbanBoards(app, boards[1] as any).map((f) => f.path)).toEqual(['b/Two.md']);
  });
});

/** Renames a lane in place, to prove the list picker reads live board state. */
function moveCardToBoardTestRename(board: any, index: number, title: string) {
  const children = [...board.children];
  children[index] = { ...children[index], data: { ...children[index].data, title } };
  return { ...board, children };
}
