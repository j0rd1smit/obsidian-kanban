import { readFileSync } from 'fs';
import { resolve } from 'path';
import { toggleItemCheckbox } from 'src/helpers/completeItem';
import { afterEach, describe, expect, it } from 'vitest';

import { Harness, findItemPath, loadBoard } from './helpers/harness';
import { stubApp, tasksSettings } from './setup';

/**
 * End to end over the real parser, state manager, board modifiers and
 * serializer: markdown in, click a card's checkbox, markdown out.
 */

const TODAY = '2026-08-07';

/**
 * A stand-in for the Tasks plugin's `executeToggleTaskDoneCommand`, modelled on
 * the real thing: completing a task stamps `✅ <today>`, and a recurring task
 * also yields its next occurrence (returned first, as Tasks does by default).
 */
function fakeTasksPlugin() {
  return {
    apiV1: {
      executeToggleTaskDoneCommand(line: string) {
        const isDone = /^- \[[^ \]]\]/.test(line);
        const body = line.replace(/^- \[[^\]]\] */, '');

        if (isDone) {
          return `- [ ] ${body.replace(/ *✅ \d{4}-\d{2}-\d{2}/, '')}`;
        }

        const done = `- [x] ${body} ✅ ${TODAY}`;
        const recurrence = body.match(/🔁 every (\w+)/);

        if (!recurrence) return done;

        const next = body.replace(/📅 (\d{4}-\d{2}-\d{2})/, (_m, date: string) => {
          const d = new Date(`${date}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + (recurrence[1] === 'week' ? 7 : 1));
          return `📅 ${d.toISOString().slice(0, 10)}`;
        });

        return `- [ ] ${next}\n${done}`;
      },
    },
  };
}

function board({
  autoMove = true,
  doneLaneName,
  moveRecurring = false,
  recurringLaneName,
  recurringLane,
}: {
  autoMove?: boolean;
  doneLaneName?: string;
  moveRecurring?: boolean;
  recurringLaneName?: string;
  /** Title of an extra lane appended to the board, when the test needs one */
  recurringLane?: string;
} = {}) {
  const settings: Record<string, any> = { 'kanban-plugin': 'board' };
  if (autoMove) settings['auto-move-done-to-lane'] = true;
  if (doneLaneName) settings['done-lane-name'] = doneLaneName;
  if (moveRecurring) settings['move-recurring-to-lane'] = true;
  if (recurringLaneName) settings['recurring-lane-name'] = recurringLaneName;

  return [
    '---',
    '',
    'kanban-plugin: board',
    '',
    '---',
    '',
    '',
    `## Todo`,
    '',
    '- [ ] Write the smoke test',
    '- [ ] Water the plants 🔁 every week 📅 2026-08-07',
    '',
    `## ${doneLaneName || 'Done'}`,
    '',
    '**Complete**',
    '',
    '- [x] Older finished thing ✅ 2026-08-01',
    '',
    ...(recurringLane
      ? ['', `## ${recurringLane}`, '', '- [ ] Take out the bins 📅 2026-08-09', '']
      : []),
    '',
    '%% kanban:settings',
    '```',
    JSON.stringify(settings),
    '```',
    '%%',
  ].join('\n');
}

/** Click the checkbox of the card whose title starts with `title`. */
function toggle(harness: Harness, title: string) {
  const path = findItemPath(harness.board(), title);

  toggleItemCheckbox(
    harness.stateManager,
    harness.boardModifiers,
    path,
    harness.board().children[path[0]].children[path[1]]
  );
}

/** Card titles per lane, keyed by lane title. */
function byLane(harness: Harness): Record<string, string[]> {
  return Object.fromEntries(
    harness
      .board()
      .children.map((lane) => [lane.data.title, lane.children.map((i) => i.data.titleRaw)])
  );
}

let restoreApp: () => void = () => {};

afterEach(() => restoreApp());

function withTasksPlugin() {
  restoreApp = stubApp({ tasksPlugin: fakeTasksPlugin(), tasksSettings: tasksSettings() });
}

function withoutTasksPlugin() {
  restoreApp = stubApp();
}

describe('completing a card, end to end', () => {
  it('parses a board without errors', async () => {
    withoutTasksPlugin();
    const harness = await loadBoard(board());

    expect(harness.errors()).toEqual([]);
    expect(harness.board().children.map((l) => l.data.title)).toEqual(['Todo', 'Done']);
  });

  it('round-trips markdown without losing anything', async () => {
    withoutTasksPlugin();
    const first = await loadBoard(board());

    // A no-op state write is enough to force serialization
    first.stateManager.setState((b) => b);
    const serialized = first.markdown();

    const second = await loadBoard(serialized);
    second.stateManager.setState((b) => b);

    expect(second.errors()).toEqual([]);
    // stable: serializing what we parsed produces the same file again
    expect(second.markdown()).toBe(serialized);
    expect(second.board().children.map((l) => l.children.map((i) => i.data.titleRaw))).toEqual(
      first.board().children.map((l) => l.children.map((i) => i.data.titleRaw))
    );
    expect(serialized).toContain('- [ ] Water the plants 🔁 every week 📅 2026-08-07');
    expect(serialized).toContain('**Complete**');
    expect(serialized).toContain('kanban-plugin: board');
  });

  it('moves a completed card to the done lane and writes it back to disk', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board());
    const path = findItemPath(harness.board(), 'Write the smoke test');

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    expect(harness.errors()).toEqual([]);
    expect(harness.markdown()).toContain(`- [x] Write the smoke test ✅ ${TODAY}`);
    expect(harness.markdown()).toMatch(
      /## Done\n\n\*\*Complete\*\*\n- \[x\] Older finished thing ✅ 2026-08-01\n- \[x\] Write the smoke test/
    );
    expect(harness.markdown()).not.toMatch(/## Todo\n\n- \[x\]/);
  });

  it('adds an inline completion date via the Tasks plugin', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board());
    const path = findItemPath(harness.board(), 'Write the smoke test');

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    const moved = harness.board().children[1].children.at(-1);
    expect(moved.data.titleRaw).toBe(`Write the smoke test ✅ ${TODAY}`);
    expect(moved.data.checked).toBe(true);
    expect(moved.data.checkChar).toBe('x');
  });

  it('moves the completed occurrence of a recurring task and leaves the next one behind', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board());
    const path = findItemPath(harness.board(), 'Water the plants');

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    expect(harness.errors()).toEqual([]);

    const md = harness.markdown();
    expect(md).toContain('- [ ] Water the plants 🔁 every week 📅 2026-08-14');
    expect(md).toContain(`- [x] Water the plants 🔁 every week 📅 2026-08-07 ✅ ${TODAY}`);

    // the next occurrence stays in Todo, the completed one is in Done
    const [todo, done] = harness.board().children;
    expect(todo.children.map((i) => i.data.titleRaw)).toEqual([
      'Write the smoke test',
      'Water the plants 🔁 every week 📅 2026-08-14',
    ]);
    expect(done.children.map((i) => i.data.titleRaw)).toEqual([
      'Older finished thing ✅ 2026-08-01',
      `Water the plants 🔁 every week 📅 2026-08-07 ✅ ${TODAY}`,
    ]);
  });

  it('leaves cards in place when the board turns the setting off', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board({ autoMove: false }));
    const path = findItemPath(harness.board(), 'Write the smoke test');

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    expect(harness.board().children[0].children.map((i) => i.data.titleRaw)).toEqual([
      `Write the smoke test ✅ ${TODAY}`,
      'Water the plants 🔁 every week 📅 2026-08-07',
    ]);
    expect(harness.board().children[1].children).toHaveLength(1);
  });

  it('lets a board override the global setting', async () => {
    withTasksPlugin();
    // auto-move on globally, off for this board
    const md = board({ autoMove: false }).replace(
      '{"kanban-plugin":"board"}',
      '{"kanban-plugin":"board","auto-move-done-to-lane":false}'
    );
    const harness = await loadBoard(md, { 'auto-move-done-to-lane': true });
    const path = findItemPath(harness.board(), 'Write the smoke test');

    expect(harness.stateManager.getSetting('auto-move-done-to-lane')).toBe(false);

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    expect(harness.board().children[0].children).toHaveLength(2);
  });

  it('honours a per-board done lane name', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board({ doneLaneName: 'Afgerond' }));
    const path = findItemPath(harness.board(), 'Write the smoke test');

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    expect(harness.board().children[1].data.title).toBe('Afgerond');
    expect(harness.board().children[1].children).toHaveLength(2);
    expect(harness.board().children[0].children).toHaveLength(1);
  });

  it('works without the Tasks plugin, minus the completion date', async () => {
    withoutTasksPlugin();
    const harness = await loadBoard(board());
    const path = findItemPath(harness.board(), 'Write the smoke test');

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    expect(harness.errors()).toEqual([]);
    expect(harness.board().children[0].children).toHaveLength(1);
    expect(harness.board().children[1].children.map((i) => i.data.titleRaw)).toEqual([
      'Older finished thing ✅ 2026-08-01',
      'Write the smoke test',
    ]);
    expect(harness.markdown()).toContain('- [x] Write the smoke test');
  });

  it('does not move a card back out when it is unchecked', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board());
    const path = findItemPath(harness.board(), 'Older finished thing');

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    expect(harness.board().children[1].children.map((i) => i.data.titleRaw)).toEqual([
      'Older finished thing',
    ]);
    expect(harness.board().children[0].children).toHaveLength(2);
  });

  it('keeps the rest of the file intact', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board());
    const path = findItemPath(harness.board(), 'Write the smoke test');

    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    const md = harness.markdown();
    expect(md.startsWith('---\n\nkanban-plugin: board\n')).toBe(true);
    expect(md).toContain('**Complete**');
    expect(md).toContain('"auto-move-done-to-lane":true');
  });
});

describe('where the next occurrence of a recurring task lands', () => {
  const NEXT = 'Water the plants 🔁 every week 📅 2026-08-14';
  const COMPLETED = `Water the plants 🔁 every week 📅 2026-08-07 ✅ ${TODAY}`;

  it('leaves it in place by default, even when a matching list exists', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board({ recurringLane: 'Recurring' }));

    toggle(harness, 'Water the plants');

    expect(harness.errors()).toEqual([]);
    expect(byLane(harness)).toEqual({
      Todo: ['Write the smoke test', NEXT],
      Done: ['Older finished thing ✅ 2026-08-01', COMPLETED],
      Recurring: ['Take out the bins 📅 2026-08-09'],
    });
  });

  it('moves it to the recurring list when the setting is on', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board({ moveRecurring: true, recurringLane: 'Recurring' }));

    toggle(harness, 'Water the plants');

    expect(harness.errors()).toEqual([]);
    expect(byLane(harness)).toEqual({
      Todo: ['Write the smoke test'],
      Done: ['Older finished thing ✅ 2026-08-01', COMPLETED],
      Recurring: ['Take out the bins 📅 2026-08-09', NEXT],
    });

    const md = harness.markdown();
    expect(md).toMatch(
      /## Recurring\n\n- \[ \] Take out the bins 📅 2026-08-09\n- \[ \] Water the plants/
    );
    expect(md).toContain(`- [x] ${COMPLETED}`);
    expect(md).not.toMatch(/## Todo\n\n- \[ \] Write the smoke test\n- \[ \] Water/);
  });

  it('works with the completed-card move turned off', async () => {
    withTasksPlugin();
    const harness = await loadBoard(
      board({ autoMove: false, moveRecurring: true, recurringLane: 'Recurring' })
    );

    toggle(harness, 'Water the plants');

    // the completed occurrence stays put, only the new one is routed
    expect(byLane(harness)).toEqual({
      Todo: ['Write the smoke test', COMPLETED],
      Done: ['Older finished thing ✅ 2026-08-01'],
      Recurring: ['Take out the bins 📅 2026-08-09', NEXT],
    });
  });

  it('leaves it in place when no list matches the name', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board({ moveRecurring: true }));

    toggle(harness, 'Water the plants');

    expect(byLane(harness)).toEqual({
      Todo: ['Write the smoke test', NEXT],
      Done: ['Older finished thing ✅ 2026-08-01', COMPLETED],
    });
  });

  it('honours a per-board recurring list name', async () => {
    withTasksPlugin();
    const harness = await loadBoard(
      board({ moveRecurring: true, recurringLaneName: 'Herhalend', recurringLane: 'Herhalend' })
    );

    toggle(harness, 'Water the plants');

    expect(byLane(harness)).toEqual({
      Todo: ['Write the smoke test'],
      Done: ['Older finished thing ✅ 2026-08-01', COMPLETED],
      Herhalend: ['Take out the bins 📅 2026-08-09', NEXT],
    });
  });

  it('leaves a card that already lives in the recurring list alone', async () => {
    withTasksPlugin();
    const md = board({ moveRecurring: true, recurringLane: 'Recurring' }).replace(
      '- [ ] Take out the bins 📅 2026-08-09',
      '- [ ] Take out the bins 🔁 every day 📅 2026-08-09'
    );
    const harness = await loadBoard(md);

    toggle(harness, 'Take out the bins');

    expect(byLane(harness)).toEqual({
      Todo: ['Write the smoke test', 'Water the plants 🔁 every week 📅 2026-08-07'],
      Done: [
        'Older finished thing ✅ 2026-08-01',
        `Take out the bins 🔁 every day 📅 2026-08-09 ✅ ${TODAY}`,
      ],
      Recurring: ['Take out the bins 🔁 every day 📅 2026-08-10'],
    });
  });

  it('does nothing to a card that is not recurring', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board({ moveRecurring: true, recurringLane: 'Recurring' }));

    toggle(harness, 'Write the smoke test');

    expect(byLane(harness)).toEqual({
      Todo: ['Water the plants 🔁 every week 📅 2026-08-07'],
      Done: ['Older finished thing ✅ 2026-08-01', `Write the smoke test ✅ ${TODAY}`],
      Recurring: ['Take out the bins 📅 2026-08-09'],
    });
  });

  it('does nothing when a card is unchecked', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board({ moveRecurring: true, recurringLane: 'Recurring' }));

    toggle(harness, 'Older finished thing');

    expect(byLane(harness)).toEqual({
      Todo: ['Write the smoke test', 'Water the plants 🔁 every week 📅 2026-08-07'],
      Done: ['Older finished thing'],
      Recurring: ['Take out the bins 📅 2026-08-09'],
    });
  });

  it('lets a board override the global setting', async () => {
    withTasksPlugin();
    // on globally, off for this board
    const md = board({ recurringLane: 'Recurring' }).replace(
      '"auto-move-done-to-lane":true}',
      '"auto-move-done-to-lane":true,"move-recurring-to-lane":false}'
    );
    const harness = await loadBoard(md, { 'move-recurring-to-lane': true });

    expect(harness.stateManager.getSetting('move-recurring-to-lane')).toBe(false);

    toggle(harness, 'Water the plants');

    expect(byLane(harness).Todo).toEqual(['Write the smoke test', NEXT]);
  });
});

describe('a checkbox ticked outside the board', () => {
  /**
   * What a Dataview or Tasks query writes into the file: the checkbox flips and
   * the line picks up a completion date. No board code runs, so the board only
   * sees it on the reparse that the file change triggers.
   */
  function tickedInAQuery(md: string, title: string) {
    return md.replace(`- [ ] ${title}`, `- [x] ${title} [completion:: ${TODAY}]`);
  }

  it('moves the card to the done lane and writes it back', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board());

    await harness.externalChange(tickedInAQuery(board(), 'Write the smoke test'));

    expect(harness.errors()).toEqual([]);
    expect(harness.board().children.map((l) => l.children.map((i) => i.data.titleRaw))).toEqual([
      ['Water the plants 🔁 every week 📅 2026-08-07'],
      ['Older finished thing ✅ 2026-08-01', `Write the smoke test [completion:: ${TODAY}]`],
    ]);
    expect(harness.markdown()).toMatch(
      new RegExp(
        `## Done\\n\\n\\*\\*Complete\\*\\*\\n- \\[x\\] Older finished thing ✅ 2026-08-01\\n- \\[x\\] Write the smoke test \\[completion:: ${TODAY}\\]`
      )
    );
  });

  it('keeps the card in place when the setting is off', async () => {
    withTasksPlugin();
    const md = board({ autoMove: false });
    const harness = await loadBoard(md);

    await harness.externalChange(tickedInAQuery(md, 'Write the smoke test'));

    expect(harness.board().children[0].children.map((i) => i.data.titleRaw)).toEqual([
      `Write the smoke test [completion:: ${TODAY}]`,
      'Water the plants 🔁 every week 📅 2026-08-07',
    ]);
    expect(harness.board().children[1].children).toHaveLength(1);
  });

  it('does not write anything when the reload changes nothing', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board());

    await harness.externalChange(board());

    expect(harness.view.saved).toEqual([]);
  });

  it('settles after one move, rather than rewriting the file on every reload', async () => {
    withTasksPlugin();
    const harness = await loadBoard(board());

    await harness.externalChange(tickedInAQuery(board(), 'Write the smoke test'));
    const afterMove = harness.view.saved.length;

    // the write lands back on disk and comes round again
    await harness.externalChange(harness.markdown());

    expect(harness.view.saved).toHaveLength(afterMove);
  });

  it('moves a card that was already complete when the board was opened', async () => {
    // the rule is the invariant, not "was ticked a moment ago": a board that was
    // closed when the tick happened has nothing to compare its parse against
    withTasksPlugin();
    const md = board().replace('- [ ] Write the smoke test', '- [x] Write the smoke test');
    const harness = await loadBoard(md);

    expect(harness.board().children[0].children.map((i) => i.data.titleRaw)).toEqual([
      'Water the plants 🔁 every week 📅 2026-08-07',
    ]);
    expect(harness.board().children[1].children.map((i) => i.data.titleRaw)).toEqual([
      'Older finished thing ✅ 2026-08-01',
      'Write the smoke test',
    ]);
    expect(harness.markdown()).toContain('- [x] Write the smoke test');
  });

  it('leaves a card complete inside a list marked **Complete** alone', async () => {
    withTasksPlugin();
    const md = board().replace(
      '## Todo\n\n- [ ] Write the smoke test',
      '## Todo\n\n**Complete**\n\n- [x] Write the smoke test'
    );
    const harness = await loadBoard(md);

    expect(harness.board().children[0].children.map((i) => i.data.titleRaw)).toEqual([
      'Write the smoke test',
      'Water the plants 🔁 every week 📅 2026-08-07',
    ]);
    expect(harness.view.saved).toEqual([]);
  });
});

describe('the example board in the demo vault', () => {
  const examplePath = resolve(__dirname, '../demo_vault/Auto-move completed cards.md');

  it('parses, and ticking its first card sends it to Done', async () => {
    withTasksPlugin();
    const harness = await loadBoard(readFileSync(examplePath, 'utf8'));

    expect(harness.errors()).toEqual([]);
    expect(harness.board().children.map((l) => l.data.title)).toEqual(['Todo', 'Doing', 'Done']);
    expect(harness.stateManager.getSetting('auto-move-done-to-lane')).toBe(true);

    const path = findItemPath(harness.board(), 'Tick me');
    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    const [todo, , done] = harness.board().children;
    expect(todo.children).toHaveLength(3);
    expect(done.children).toHaveLength(2);
    expect(done.children.at(-1).data.titleRaw).toContain(`✅ ${TODAY}`);
  });

  it('splits its recurring card the way the comment on it promises', async () => {
    withTasksPlugin();
    const harness = await loadBoard(readFileSync(examplePath, 'utf8'));

    const path = findItemPath(harness.board(), 'Water the plants');
    toggleItemCheckbox(
      harness.stateManager,
      harness.boardModifiers,
      path,
      harness.board().children[path[0]].children[path[1]]
    );

    const [todo, , done] = harness.board().children;
    expect(todo.children.map((i) => i.data.titleRaw)).toContain(
      'Water the plants 🔁 every week 📅 2026-08-14'
    );
    expect(done.children.at(-1).data.titleRaw).toBe(
      `Water the plants 🔁 every week 📅 2026-08-07 ✅ ${TODAY}`
    );
  });
});

describe('the recurring board in the demo vault', () => {
  const examplePath = resolve(__dirname, '../demo_vault/Recurring cards.md');

  it('parses, with both settings on', async () => {
    withTasksPlugin();
    const harness = await loadBoard(readFileSync(examplePath, 'utf8'));

    expect(harness.errors()).toEqual([]);
    expect(harness.board().children.map((l) => l.data.title)).toEqual([
      'Todo',
      'Doing',
      'Recurring',
      'Done',
    ]);
    expect(harness.stateManager.getSetting('auto-move-done-to-lane')).toBe(true);
    expect(harness.stateManager.getSetting('move-recurring-to-lane')).toBe(true);
  });

  it('sends a ticked recurring card two ways, the way the board promises', async () => {
    withTasksPlugin();
    const harness = await loadBoard(readFileSync(examplePath, 'utf8'));

    toggle(harness, 'Water the plants');

    expect(harness.errors()).toEqual([]);
    expect(byLane(harness)).toEqual({
      Todo: [
        'Stand-up notes 🔁 every day 📅 2026-08-07 ⏫',
        'Tick me — not recurring, so I just go to Done',
      ],
      Doing: ['Drag me into Done — the drop path is not covered by this setting'],
      Recurring: [
        'Pay the rent 🔁 every month 📅 2026-09-01',
        'Water the plants 🔁 every week 📅 2026-08-14',
      ],
      Done: [
        'Something finished earlier ✅ 2026-08-01',
        `Water the plants 🔁 every week 📅 2026-08-07 ✅ ${TODAY}`,
      ],
    });
  });

  it('leaves a non-recurring card to the plain auto-move', async () => {
    withTasksPlugin();
    const harness = await loadBoard(readFileSync(examplePath, 'utf8'));

    toggle(harness, 'Tick me');

    expect(byLane(harness).Recurring).toEqual(['Pay the rent 🔁 every month 📅 2026-09-01']);
    expect(byLane(harness).Done.at(-1)).toBe(
      `Tick me — not recurring, so I just go to Done ✅ ${TODAY}`
    );
  });
});
