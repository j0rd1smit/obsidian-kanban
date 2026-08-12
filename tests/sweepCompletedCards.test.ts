import {
  ClosedBoardSweeper,
  boardFileAutoMoveOptions,
  sweepBoardFile,
  sweepCompletedCards,
} from 'src/helpers/sweepCompletedCards';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { wrapBoard } from './helpers/boards';
import { loadBoard } from './helpers/harness';
import { TFile } from './mocks/obsidian';

/**
 * Auto-move for a board no view has open: the file is edited as text, so these
 * tests are about markdown in, markdown out. The last block feeds the result
 * through the real parser, which is the guard that the splicing keeps producing
 * a board the plugin can still read.
 */

const enabled = { enabled: true, laneName: 'Done' };

const BOARD = wrapBoard([
  '## Todo',
  '',
  '- [ ] Still to do',
  '- [x] Ticked in a query [completion:: 2026-08-12]',
  '',
  '',
  '## Doing',
  '',
  '- [ ] In progress',
  '',
  '',
  '## Done',
  '',
  '**Complete**',
  '- [x] Finished earlier',
  '',
  '',
]);

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

/** Lets the sweep's reads and writes finish; `queue` does not return a promise. */
function flush() {
  return new Promise((res) => setTimeout(res, 0));
}

/** Backs `app.vault` with an in-memory set of files for the duration of a test. */
function fakeVault(files: Record<string, string>) {
  const app = (globalThis as any).app;
  const previous = { vault: { ...app.vault }, metadataCache: { ...app.metadataCache } };
  const fileFor = (path: string) => new TFile(path);

  app.vault.cachedRead = async (file: TFile) => files[file.path];
  app.vault.read = app.vault.cachedRead;
  app.vault.process = async (file: TFile, fn: (data: string) => string) => {
    files[file.path] = fn(files[file.path]);
    return files[file.path];
  };
  app.vault.getMarkdownFiles = () => Object.keys(files).map(fileFor);
  app.metadataCache.getFileCache = () => ({ frontmatter: { 'kanban-plugin': 'board' } });

  restore = () => Object.assign(app, previous);

  return files;
}

describe('sweepCompletedCards', () => {
  it('moves a complete card into the done list', () => {
    const swept = sweepCompletedCards(BOARD, enabled);

    expect(swept).toContain(
      '- [x] Finished earlier\n- [x] Ticked in a query [completion:: 2026-08-12]'
    );
    expect(swept).not.toMatch(/## Todo\n\n- \[ \] Still to do\n- \[x\]/);
  });

  it('leaves every other byte of the file alone', () => {
    const swept = sweepCompletedCards(BOARD, enabled);
    const moved = '- [x] Ticked in a query [completion:: 2026-08-12]';

    // what is left is the original with the card line lifted out of Todo and
    // put back at the end of Done
    expect(swept.split('\n').filter((l) => l === moved)).toHaveLength(1);
    expect(swept.startsWith('---\n\nkanban-plugin: board\n')).toBe(true);
    expect(swept).toContain('%% kanban:settings');
    expect(swept).toContain('## Doing\n\n- [ ] In progress');
  });

  it('returns null when nothing is out of place', () => {
    expect(sweepCompletedCards(sweepCompletedCards(BOARD, enabled), enabled)).toBeNull();
  });

  it('returns null when the feature is off', () => {
    expect(sweepCompletedCards(BOARD, { ...enabled, enabled: false })).toBeNull();
  });

  it('returns null when no list matches the configured name', () => {
    expect(sweepCompletedCards(BOARD, { enabled: true, laneName: 'Afgerond' })).toBeNull();
  });

  it('matches the done list case-insensitively', () => {
    expect(sweepCompletedCards(BOARD, { enabled: true, laneName: ' dOnE ' })).not.toBeNull();
  });

  it('moves several cards, from several lists, in file order', () => {
    const md = wrapBoard([
      '## Todo',
      '',
      '- [x] First',
      '- [ ] Not this one',
      '',
      '',
      '## Doing',
      '',
      '- [x] Second',
      '',
      '',
      '## Done',
      '',
      '- [x] Older',
      '',
      '',
    ]);

    expect(sweepCompletedCards(md, enabled)).toContain(
      '## Done\n\n- [x] Older\n- [x] First\n- [x] Second'
    );
  });

  it('takes a card that spans several lines with it', () => {
    const md = wrapBoard([
      '## Todo',
      '',
      '- [x] A card that spans',
      '    more than one line',
      '- [ ] Another card',
      '',
      '',
      '## Done',
      '',
      '- [x] Older',
      '',
      '',
    ]);

    const swept = sweepCompletedCards(md, enabled);

    expect(swept).toContain(
      '## Done\n\n- [x] Older\n- [x] A card that spans\n    more than one line'
    );
    expect(swept).toContain('## Todo\n\n- [ ] Another card');
  });

  it('does not treat a checklist item inside a card as a card', () => {
    const md = wrapBoard([
      '## Todo',
      '',
      '- [ ] A card with a checklist',
      '    - [x] a step that is done',
      '',
      '',
      '## Done',
      '',
      '- [x] Older',
      '',
      '',
    ]);

    expect(sweepCompletedCards(md, enabled)).toBeNull();
  });

  it('leaves a list marked **Complete** alone', () => {
    const md = wrapBoard([
      '## Archive',
      '',
      '**Complete**',
      '- [x] Shipped',
      '',
      '',
      '## Done',
      '',
      '- [x] Older',
      '',
      '',
    ]);

    expect(sweepCompletedCards(md, enabled)).toBeNull();
  });

  it('never touches the archive', () => {
    const md = [
      '---',
      '',
      'kanban-plugin: board',
      '',
      '---',
      '',
      '',
      '## Todo',
      '',
      '- [ ] Still to do',
      '',
      '',
      '## Done',
      '',
      '- [x] Older',
      '',
      '',
      '***',
      '',
      '## Archive',
      '',
      '- [x] Something archived',
      '',
      '%% kanban:settings',
      '```',
      '{"kanban-plugin":"board"}',
      '```',
      '%%',
    ].join('\n');

    expect(sweepCompletedCards(md, enabled)).toBeNull();
  });

  it('ignores a card checked into a non-done status', () => {
    const md = wrapBoard(['## Doing', '', '- [/] In progress', '', '', '## Done', '', '', '']);

    expect(sweepCompletedCards(md, enabled)).toBeNull();
  });

  it('prepends when the board prepends new cards', () => {
    const swept = sweepCompletedCards(BOARD, { ...enabled, insertionMethod: 'prepend' });

    expect(swept).toContain(
      '**Complete**\n- [x] Ticked in a query [completion:: 2026-08-12]\n- [x] Finished earlier'
    );
  });

  it('moves into a done list that sits before the card', () => {
    const md = wrapBoard([
      '## Done',
      '',
      '- [x] Older',
      '',
      '',
      '## Todo',
      '',
      '- [x] Done with it',
      '- [ ] Not yet',
      '',
      '',
    ]);

    const swept = sweepCompletedCards(md, enabled);

    expect(swept).toContain('## Done\n\n- [x] Older\n- [x] Done with it');
    expect(swept).toContain('## Todo\n\n- [ ] Not yet');
  });

  it('moves into an empty done list', () => {
    const md = wrapBoard(['## Todo', '', '- [x] Done with it', '', '', '## Done', '', '', '']);

    expect(sweepCompletedCards(md, enabled)).toContain('## Done\n\n- [x] Done with it');
  });
});

describe('boardFileAutoMoveOptions', () => {
  it('reads the board settings out of the footer', () => {
    const md = wrapBoard(['## Done', '', '', ''], {
      'auto-move-done-to-lane': true,
      'done-lane-name': 'Afgerond',
      'new-card-insertion-method': 'prepend',
    });

    expect(boardFileAutoMoveOptions(md, {})).toEqual({
      enabled: true,
      laneName: 'Afgerond',
      insertionMethod: 'prepend',
    });
  });

  it('falls back to the global settings', () => {
    const md = wrapBoard(['## Done', '', '', '']);

    expect(boardFileAutoMoveOptions(md, { 'auto-move-done-to-lane': true })).toMatchObject({
      enabled: true,
      laneName: 'Done',
    });
  });

  it('lets the board turn the global setting off', () => {
    const md = wrapBoard(['## Done', '', '', ''], { 'auto-move-done-to-lane': false });

    expect(boardFileAutoMoveOptions(md, { 'auto-move-done-to-lane': true }).enabled).toBe(false);
  });

  it('lets frontmatter override the settings footer, as the parser does', () => {
    const md = wrapBoard(['## Done', '', '', ''], { 'done-lane-name': 'Afgerond' }).replace(
      'kanban-plugin: board\n',
      'kanban-plugin: board\ndone-lane-name: Klaar\n'
    );

    expect(boardFileAutoMoveOptions(md, {}).laneName).toBe('Klaar');
  });
});

describe('sweepBoardFile', () => {
  it('writes the moved card back to the file', async () => {
    const files = fakeVault({ 'Board.md': BOARD });

    const wrote = await sweepBoardFile((globalThis as any).app, new TFile('Board.md'), {
      'auto-move-done-to-lane': true,
    });

    expect(wrote).toBe(true);
    expect(files['Board.md']).toContain(
      '- [x] Finished earlier\n- [x] Ticked in a query [completion:: 2026-08-12]'
    );
  });

  it('leaves the file untouched when there is nothing to move', async () => {
    const files = fakeVault({ 'Board.md': BOARD });
    const app = (globalThis as any).app;
    const process = vi.spyOn(app.vault, 'process');

    const wrote = await sweepBoardFile(app, new TFile('Board.md'), {});

    expect(wrote).toBe(false);
    expect(process).not.toHaveBeenCalled();
    expect(files['Board.md']).toBe(BOARD);
  });

  it('settles: a second pass over its own output writes nothing', async () => {
    fakeVault({ 'Board.md': BOARD });
    const app = (globalThis as any).app;
    const file = new TFile('Board.md');
    const settings = { 'auto-move-done-to-lane': true };

    await sweepBoardFile(app, file, settings);

    expect(await sweepBoardFile(app, file, settings)).toBe(false);
  });
});

describe('ClosedBoardSweeper', () => {
  const host = (files: Record<string, string>, open: string[] = []) => ({
    app: (globalThis as any).app,
    isOpen: (file: TFile) => open.contains(file.path),
    getGlobalSettings: () => ({ 'auto-move-done-to-lane': true }),
  });

  it('sweeps every closed board in the vault', async () => {
    const files = fakeVault({ 'One.md': BOARD, 'Two.md': BOARD });

    await new ClosedBoardSweeper(host(files) as any).sweepAll();

    expect(files['One.md']).toContain('- [x] Finished earlier\n- [x] Ticked in a query');
    expect(files['Two.md']).toContain('- [x] Finished earlier\n- [x] Ticked in a query');
  });

  it('leaves a board that is open to its own state manager', async () => {
    const files = fakeVault({ 'Open.md': BOARD });

    await new ClosedBoardSweeper(host(files, ['Open.md']) as any).sweepAll();

    expect(files['Open.md']).toBe(BOARD);
  });

  it('sweeps a board that changed on disk', async () => {
    // the debounce stub calls straight through, so the queue drains here
    const files = fakeVault({ 'Board.md': BOARD });

    new ClosedBoardSweeper(host(files) as any).queue(new TFile('Board.md'));
    await flush();

    expect(files['Board.md']).toContain('- [x] Finished earlier\n- [x] Ticked in a query');
  });

  it('ignores a change to a file that is not a board', async () => {
    const files = fakeVault({ 'Note.md': BOARD });
    (globalThis as any).app.metadataCache.getFileCache = () => ({ frontmatter: {} });

    new ClosedBoardSweeper(host(files) as any).queue(new TFile('Note.md'));
    await flush();

    expect(files['Note.md']).toBe(BOARD);
  });

  it('ignores a change to a board that is open', async () => {
    const files = fakeVault({ 'Open.md': BOARD });

    new ClosedBoardSweeper(host(files, ['Open.md']) as any).queue(new TFile('Open.md'));
    await flush();

    expect(files['Open.md']).toBe(BOARD);
  });
});

describe('what the sweep leaves behind', () => {
  it('still parses, with the card in the done list', async () => {
    const swept = sweepCompletedCards(BOARD, enabled);
    const harness = await loadBoard(swept);

    expect(harness.errors()).toEqual([]);
    expect(harness.board().children.map((l) => l.children.map((i) => i.data.titleRaw))).toEqual([
      ['Still to do'],
      ['In progress'],
      ['Finished earlier', 'Ticked in a query [completion:: 2026-08-12]'],
    ]);
  });

  it('lands the card where the in-memory rule would have put it', async () => {
    // the same board, moved the two ways: as text with the board closed, and by
    // `autoMoveCompletedItems` on the parsed board. Both end up on disk, and the
    // two files have to agree.
    const asText = await loadBoard(sweepCompletedCards(BOARD, enabled));
    asText.stateManager.setState((b) => b);

    const asBoard = await loadBoard(BOARD, { 'auto-move-done-to-lane': true });

    expect(asBoard.markdown()).toBe(asText.markdown());
  });

  it('empties a list without leaving anything the parser trips on', async () => {
    const md = wrapBoard([
      '## Todo',
      '',
      '- [x] The only card',
      '',
      '',
      '## Done',
      '',
      '- [x] Older',
      '',
      '',
    ]);

    const harness = await loadBoard(sweepCompletedCards(md, enabled));

    expect(harness.errors()).toEqual([]);
    expect(harness.board().children.map((l) => l.children.length)).toEqual([0, 2]);
  });
});
