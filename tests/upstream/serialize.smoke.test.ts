/**
 * Upstream behaviour guard: board -> markdown, and back again.
 *
 * The on-disk format is the one thing a fork may not break: every existing
 * board has to keep parsing, and saving a board the user never edited must not
 * rewrite their file. The golden test below is deliberately an exact string
 * comparison against `tests/fixtures/kitchen-sink.md` — if upstream changes how
 * a board is written out, this is where we find out.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { KITCHEN_SINK, wrapBoard } from '../helpers/boards';
import { Harness, loadBoard } from '../helpers/harness';

/** Board in, board out: a no-op state write is enough to force serialization. */
async function save(md: string): Promise<string> {
  const harness = await loadBoard(md);
  harness.stateManager.setState((b) => b);
  return harness.markdown();
}

function shape(harness: Harness) {
  return harness.board().children.map((lane) => ({
    title: lane.data.title,
    maxItems: lane.data.maxItems,
    complete: !!lane.data.shouldMarkItemsComplete,
    items: lane.children.map((i) => [i.data.titleRaw, i.data.checkChar, i.data.blockId]),
  }));
}

describe('serializing a board', () => {
  it('writes lanes, the complete marker and the settings codeblock', async () => {
    const md = await save(
      wrapBoard(['## Todo (2)', '', '- [ ] One', '', '## Done', '', '**Complete**', '- [x] Two'])
    );

    expect(md).toContain('## Todo (2)');
    expect(md).toContain('- [ ] One');
    expect(md).toMatch(/## Done\n\n\*\*Complete\*\*\n- \[x\] Two/);
    expect(md).toMatch(/%% kanban:settings\n```\n\{.*\}\n```\n%%$/);
  });

  it('starts the file with frontmatter', async () => {
    const md = await save(wrapBoard(['## Todo', '', '- [ ] One']));

    expect(md.startsWith('---\n\nkanban-plugin: board\n\n---\n\n')).toBe(true);
  });

  it('re-indents a multi-line card', async () => {
    const md = await save(wrapBoard(['## Todo', '', '- [ ] First line', '    second line']));

    expect(md).toContain('- [ ] First line\n    second line\n');
  });

  it('puts a block id back on the first line of the card', async () => {
    const md = await save(wrapBoard(['## Todo', '', '- [ ] A card ^abc123', '    second line']));

    expect(md).toContain('- [ ] A card ^abc123\n    second line');
  });

  it('writes the archive after a *** and an ## Archive heading', async () => {
    const md = await save(
      wrapBoard(['## Todo', '', '- [ ] One', '', '***', '', '## Archive', '', '- [x] Old'])
    );

    expect(md).toMatch(/\*\*\*\n\n## Archive\n\n- \[x\] Old/);
  });

  it('writes titleRaw, so a display-only title change is not persisted', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card #alpha']), {
      'move-tags': true,
    });

    // move-tags strips the tag from `title`, the rendered text
    expect(harness.board().children[0].children[0].data.title).toBe('Card');

    harness.stateManager.setState((b) => b);
    expect(harness.markdown()).toContain('- [ ] Card #alpha');
  });

  it('keeps a lane that has no cards', async () => {
    const md = await save(wrapBoard(['## Todo', '', '## Doing', '', '- [ ] One']));

    expect(md).toContain('## Todo');
    expect(md).toContain('## Doing');
  });
});

describe('round-tripping', () => {
  it('is stable: parse, save, parse, save gives the same file', async () => {
    const first = await save(wrapBoard(['## Todo (2)', '', '- [ ] One #tag @{2026-08-07}']));
    const second = await save(first);

    expect(second).toBe(first);
  });

  it('preserves the whole kitchen sink board, byte for byte', async () => {
    // boardToMd emits no trailing newline; the fixture on disk has one
    const fixture = readFileSync(resolve(__dirname, '..', KITCHEN_SINK), 'utf8').replace(/\n$/, '');
    const before = await loadBoard(fixture);

    before.stateManager.setState((b) => b);
    expect(before.errors()).toEqual([]);
    expect(before.markdown()).toBe(fixture);

    // and the board it parses to is unchanged by the trip through markdown
    const after = await loadBoard(before.markdown());
    expect(shape(after)).toEqual(shape(before));
    expect(after.board().data.archive.map((i) => i.data.titleRaw)).toEqual(
      before.board().data.archive.map((i) => i.data.titleRaw)
    );
    expect(after.board().data.frontmatter).toEqual(before.board().data.frontmatter);
    expect(after.board().data.settings).toEqual(before.board().data.settings);
  });

  it('migrates a setting written in frontmatter into the settings codeblock', async () => {
    const md = await save(
      [
        '---',
        '',
        'kanban-plugin: board',
        'author: nobody',
        'show-checkboxes: false',
        '',
        '---',
        '',
        '',
        '## Todo',
        '',
        '- [ ] One',
      ].join('\n')
    );

    // the frontmatter keeps only what is not a setting...
    expect(md).toContain('kanban-plugin: board\nauthor: nobody\n');
    expect(md).not.toMatch(/---[\s\S]*show-checkboxes[\s\S]*---/);
    // ...and the setting moves to the codeblock
    expect(md).toContain('"show-checkboxes":false');
  });
});
