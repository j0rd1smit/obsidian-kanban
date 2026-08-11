/**
 * Upstream behaviour guard: settings resolution.
 *
 * Settings arrive from three places — the plugin's global settings, the board's
 * own codeblock, and the board's frontmatter — and `getSetting` has to resolve
 * them in that order while `compileSettings` fills in the derived defaults the
 * parser reads. Getting this wrong is silent: the board still renders, just not
 * the way the user configured it.
 */
import { describe, expect, it } from 'vitest';

import { wrapBoard } from '../helpers/boards';
import { loadBoard } from '../helpers/harness';

describe('resolution order', () => {
  it('falls back to the global setting when the board says nothing', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo']), { 'lane-width': 300 });

    expect(harness.stateManager.getSetting('lane-width')).toBe(300);
  });

  it('lets the board override the global setting', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo'], { 'lane-width': 500 }), {
      'lane-width': 300,
    });

    expect(harness.stateManager.getSetting('lane-width')).toBe(500);
  });

  it('reads a setting written in the board frontmatter', async () => {
    const harness = await loadBoard(
      ['---', '', 'kanban-plugin: board', 'lane-width: 450', '', '---', '', '', '## Todo'].join(
        '\n'
      ),
      { 'lane-width': 300 }
    );

    expect(harness.stateManager.getSetting('lane-width')).toBe(450);
  });

  it('merges metadata keys from the global and board layers', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo'], {
        'metadata-keys': [
          {
            metadataKey: 'status',
            label: 'Status',
            shouldHideLabel: false,
            containsMarkdown: false,
          },
        ],
      }),
      {
        'metadata-keys': [
          { metadataKey: 'owner', label: 'Owner', shouldHideLabel: false, containsMarkdown: false },
        ],
      }
    );

    expect(harness.stateManager.getSetting('metadata-keys').map((k) => k.metadataKey)).toEqual([
      'owner',
      'status',
    ]);
  });
});

describe('compiled defaults', () => {
  it('supplies the trigger and format defaults a board relies on', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo']));
    const setting = harness.stateManager.getSetting;

    expect(setting('date-trigger')).toBe('@');
    expect(setting('time-trigger')).toBe('@@');
    expect(setting('date-format')).toBe('YYYY-MM-DD');
    expect(setting('time-format')).toBe('HH:mm');
    expect(setting('inline-metadata-position')).toBe('body');
    expect(setting('kanban-plugin')).toBe('board');
  });

  it('derives the display and archive formats from the date and time formats', async () => {
    const harness = await loadBoard(
      wrapBoard(['## Todo'], { 'date-format': 'DD/MM/YYYY', 'time-format': 'HH:mm:ss' })
    );
    const setting = harness.stateManager.getSetting;

    expect(setting('date-display-format')).toBe('DD/MM/YYYY');
    expect(setting('date-time-display-format')).toBe('DD/MM/YYYY HH:mm:ss');
    expect(setting('archive-date-format')).toBe('DD/MM/YYYY HH:mm:ss');
  });

  it('defaults the header buttons on and the colour lists empty', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo']));
    const setting = harness.stateManager.getSetting;

    expect(setting('show-add-list')).toBe(true);
    expect(setting('show-archive-all')).toBe(true);
    expect(setting('show-view-as-markdown')).toBe(true);
    expect(setting('show-board-settings')).toBe(true);
    expect(setting('show-search')).toBe(true);
    expect(setting('show-set-view')).toBe(true);
    expect(setting('tag-action')).toBe('obsidian');
    expect(setting('tag-colors')).toEqual([]);
    expect(setting('tag-sort')).toEqual([]);
    expect(setting('date-colors')).toEqual([]);
  });

  it('lets a board turn a header button off', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo'], { 'show-search': false }));

    expect(harness.stateManager.getSetting('show-search')).toBe(false);
  });
});

describe('changing settings', () => {
  it('reparses every card when a setting that affects parsing changes', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card #alpha']));

    expect(harness.board().children[0].children[0].data.title).toBe('Card #alpha');

    harness.stateManager.setState((board) => ({
      ...board,
      data: { ...board.data, settings: { ...board.data.settings, 'move-tags': true } },
    }));

    // the rendered title is rebuilt, the raw text is untouched
    expect(harness.board().children[0].children[0].data.title).toBe('Card');
    expect(harness.board().children[0].children[0].data.titleRaw).toBe('Card #alpha');
  });

  it('writes a changed board setting into the settings codeblock', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] One']));

    harness.stateManager.setState((board) => ({
      ...board,
      data: { ...board.data, settings: { ...board.data.settings, 'lane-width': 420 } },
    }));

    expect(harness.markdown()).toContain('"lane-width":420');

    // and it survives a reload
    const reloaded = await loadBoard(harness.markdown());
    expect(reloaded.stateManager.getSetting('lane-width')).toBe(420);
  });
});
