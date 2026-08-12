# Tests

`yarn test` runs vitest (`vitest.config.ts`, specs in `tests/`).

- There is no runtime `obsidian` module, so vitest aliases `obsidian` and `obsidian-dataview` to stubs in `tests/mocks/`.
  The `obsidian` stub implements `moment`, `TFile`, a flat-map `parseYaml` / `stringifyYaml`, and class stubs for everything else.
- `obsidian-daily-notes-interface` is aliased to a stub too.
  It ships CJS only and `require`s `obsidian`, so Vite externalizes it and the `obsidian` alias never applies inside it — aliasing the whole package is the only thing that works.
  `server.deps.inline` and `ssr.noExternal` both fail to stop the externalization.
- `tests/setup.ts` installs the prototype extensions Obsidian adds (`Array.prototype.last` and friends — `dnd/util/data.ts` depends on `last()`), a `window`/`activeWindow`, and a global `app` stub.
  `stubApp({ tasksPlugin, tasksSettings })` swaps in a fake Tasks plugin, which is how the recurring-task behavior is tested.
  The `debounce` stub calls straight through instead of waiting, so a debounced code path runs inside the test that triggers it.
- The environment is `jsdom`, because `Settings.ts` pulls in `choices.js`, which touches `document` at import time.
- `tests/helpers/harness.ts` boots a **real** `StateManager` over a markdown string with a `FakeKanbanView`.
  `view.saved` collects what `saveToDisk` writes, so a smoke test can assert on markdown in / markdown out through the real parser, settings resolution and serializer.
  `registerView` is async and the constructor does not await it, hence the small delay in `loadBoard`.
  `harness.externalChange(md)` replays what Obsidian does when the file changes on disk under an open board, which is how the reparse-side auto-move is tested. See [card-completion.md](card-completion.md).
- The round-trip test in `tests/completeItem.smoke.test.ts` is the guard for "existing boards must keep parsing" — it asserts serialization is stable across a reparse.
- Two tests load the demo vault's board from disk, so an example that stops working fails the suite.
  See [demo-vault.md](demo-vault.md).

## Two tiers

| Where | Covers | Depth |
| --- | --- | --- |
| `tests/*.test.ts` | this fork's own code (`src/helpers/completeItem.ts`, `boardMarkdown.ts`, `moveCardToBoard.ts`) | unit + integration, edge cases included |
| `tests/upstream/*.smoke.test.ts` | upstream behavior this fork inherits | smoke only — one assertion per user-visible behavior |

The `tests/upstream/` tier exists for merging upstream: it is a CI signal that
says "the original plugin still does what it did", not a spec of the original
plugin. Keep it that way — a smoke test that fails for a cosmetic upstream
change costs more than it catches. Add depth in the top-level tier instead.

Files, and the behavior each pins:

- `parse.smoke.test.ts` — markdown -> board: lanes, cards, checkbox chars, WIP limits, `**Complete**`, archive, multi-line cards, block ids, tags/dates/times/links, the frontmatter vs settings split, and the parse failures that must not throw.
- `serialize.smoke.test.ts` — board -> markdown, plus an exact-string golden test against `tests/fixtures/kitchen-sink.md`.
- `boardModifiers.smoke.test.ts` — every operation the card and list menus call, down to the markdown written back.
- `dragAndDrop.smoke.test.ts` — moving cards and lists, and the checkbox flip when a card crosses a complete lane.
- `settings.smoke.test.ts` — global / board / frontmatter resolution order and the compiled defaults.
- `stateManager.smoke.test.ts` — the diff/patch reparse that preserves ids, and the write path (including that an errored board is never saved).
- `cardDates.smoke.test.ts` — what the card menu's date and time pickers write into a card.

The fork's own tier, and what each file pins:

- `completeItem.test.ts` / `completeItem.smoke.test.ts` — the checkbox handler and the auto-move-to-done setting.
- `sweepCompletedCards.test.ts` — the same rule applied to a board file no view has open, including that both paths land the card in the same place. See [card-completion.md](card-completion.md).
- `boardMarkdown.test.ts` — reading a board file's lists and splicing a card line into one, checked against the real parser at the end.
- `moveCardToBoard.test.ts` — moving a card to another board, both write paths. `fakeVault` in that file backs `app.vault` with an in-memory map for the closed-board path. See [cross-board-card-moves.md](cross-board-card-moves.md).

Supporting files:

- `tests/fixtures/kitchen-sink.md` is a board using every parser feature at once, in exactly the form `boardToMd` emits, so parse -> serialize is byte-identical to the file. Regenerate it by saving it through the harness, never by hand.
- `tests/helpers/boards.ts` has `wrapBoard(lines, settings)`, which supplies the frontmatter and settings codeblock so a test only spells out the lanes.
- `tests/helpers/drop.ts` reproduces `handleDrop`'s same-board branch. `handleDrop` is a closure inside `DragDropApp`, so it cannot be called; this is a copy, and it guards the pieces it composes (`moveEntity`, `maybeCompleteForMove`, the path arithmetic) rather than the wiring in `DragDropApp`. See [drag-and-drop.md](drag-and-drop.md).

Not covered, because it needs a rendered component: search filtering (`useSearchValue`), the table view's columns (`useTableColumns`), and lane sorting (the callbacks live inside `LaneMenu.tsx`).

## Gotchas

- `src/lang/helpers.ts` reads `window.localStorage` at **import** time, so every test file needs it before any source module loads.
  Under jsdom `window === globalThis` and `localStorage` is present but is a null-prototype object with no `Storage` methods, so a `if (!window.localStorage)` guard silently skips the stub.
  `tests/setup.ts` checks for `typeof localStorage?.getItem === 'function'` instead.
- Only `src/*.ts` and `src/*.tsx` are in `tsconfig.json`'s `include`; subdirectories are pulled in through imports.
  `tests/` has its own program, `tsconfig.tests.json`, run by `yarn typecheck:tests` — see [ci.md](ci.md).
- `harness.ts` imports `TFile` from `../mocks/obsidian`, not from `obsidian`.
  The alias means the stub is what runs, and its constructor takes a path where the published typings declare a zero-argument one.
- `setup.ts` annotates the return type of every stub that returns `null` or `[]`.
  `strictNullChecks` is off, so `null` widens to `any` and `noImplicitAny` rejects the function (TS7011).
- `FakeKanbanView.populateViewState` seeds `list-collapse` to `[]` the way `KanbanView` does.
  `insertLane`, `archiveLane`, `deleteEntity` and `duplicateEntity` splice that array with no fallback, so a view that never seeded it throws in a test where the app is fine.
- A board with a parse error never reaches disk (`saveToDisk` bails on `state.data.errors`), so `harness.markdown()` is `''` for those tests, not the input.
- `StateManager.getParsedBoard` **logs** a parse failure as well as recording it (`src/StateManager.ts:325`), so a test that feeds the parser broken input prints a stack trace vitest forwards to stderr.
  The two in `parse.smoke.test.ts` stub `console.error` with `vi.spyOn` and assert it was called, which keeps a green run quiet and pins the reporting at the same time.
  Do that per test, never globally in `setup.ts` — a blanket stub would also swallow the unexpected `console.error` that a passing run should let you see.
  `restoreMocks: true` in `vitest.config.ts` puts the real one back afterwards, including when an assertion throws first.
