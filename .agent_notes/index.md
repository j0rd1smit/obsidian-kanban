# Agent notes index

One line per note: `<filepath>: <short summary>`.
Grep this file first, then open only the notes you need.
Keep it in sync whenever you add, rename, or delete a note.

## Architecture

architecture/CLAUDE.md: format rules for architecture notes.
architecture/overview.md: top-level wiring — main.ts, KanbanView, DragDropApp, StateManager — and the markdown -> board -> markdown data flow.
architecture/board-state.md: Board/Lane/Item tree, Path addressing, immutable mutation helpers, boardModifiers, and the setState / saveToDisk write path.
architecture/parsing.md: parseMarkdown and astToUnhydratedBoard, hydration, the diff/patch reparse that preserves entity ids, and boardToMd serialization.
architecture/settings.md: global / per-board / per-view layers, getSetting resolution order, compileSettings, shouldRefreshBoard, and how to add a setting.
architecture/drag-and-drop.md: custom DnD in src/dnd, the handleDrop branches, moveEntity + maybeCompleteForMove, and how to build a synthetic card move.
architecture/cross-board-card-moves.md: the card menu's "Move to other board" flow, and the two write paths for a destination board (open -> its StateManager, closed -> its markdown file).
architecture/card-completion.md: checkbox handling in src/helpers/completeItem.ts, Tasks-plugin recurring tasks, the auto-move-to-done settings, and the "no complete card outside the done list" invariant enforced on parse and on closed board files (sweepCompletedCards.ts).
architecture/testing.md: vitest setup, obsidian module stubs, the real-StateManager harness, the markdown round-trip guard, and the two test tiers (fork code in depth, upstream behaviour by smoke test in tests/upstream/).
architecture/demo-vault.md: demo_vault/ as a real Obsidian vault, yarn build:demo / dev:demo, and what is gitignored.
architecture/ci.md: the GitHub Actions gate and yarn ci — install/lockfile/typecheck/lint/format/test/build, the three tsconfig programs (json / tests / eslint), the lockfile transport check, and the one-button release workflow.

## Changelog

changelog/CLAUDE.md: format rules for changelog entries.
changelog/2026-08-07-name-to-avoid-clashing-with-upstream.md: plugin id obsidian-kanban -> kanban-custom, display name Kanban -> Kanban (custom), so the fork can run beside upstream.
changelog/2026-08-07-auto-move-a-card-to-the-done-list-when-its-checkbox-is-ticked.md: auto-move-done-to-lane + done-lane-name settings, checkbox handler extracted to completeItem.ts, vitest setup and demo_vault added.
changelog/2026-08-10-pin-cm-language-over-https-instead-of-ssh.md: yarn.lock resolves the cm-language git dep over https so yarn install works without a GitHub SSH key.
changelog/2026-08-10-get-yarn-test-and-typecheck-passing-again.md: declare the global app, type ViewState.state.file, fix the localStorage guard, and stub obsidian-daily-notes-interface.
changelog/2026-08-10-fetch-the-obsidian-api-dep-over-git-instead-of-a-codeload-tarball.md: yarn.lock resolves the obsidian dep over git+https instead of a codeload.github.com tarball, which the sandbox egress proxy blocks with a 403.
changelog/2026-08-10-add-a-ci-workflow-and-make-lint-enforceable.md: ci.yml gate on custom, scripts/check-lockfile.mjs, tsconfig.eslint.json so lint passes, .nvmrc, and release.yml building from the lockfile.
changelog/2026-08-11-smoke-tests-for-upstream-behaviour.md: tests/upstream/ — a shallow CI signal that the behaviour inherited from upstream still works, the kitchen-sink fixture, and the synthetic drop helper.
changelog/2026-08-11-typecheck-tests-in-ci.md: tsconfig.tests.json + yarn typecheck:tests as its own CI step, es2022 lib for tests only, and the TFile-stub and TS7011 fixes it forced.
changelog/2026-08-11-release-from-a-button-in-the-actions-tab.md: release.yml gains a workflow_dispatch patch/minor/major button that bumps, runs yarn ci, tags and publishes; the tag-push path stays as an escape hatch.
changelog/2026-08-11-move-a-card-to-another-board-from-the-card-menu.md: "Move to other board" in the card menu — board picker, then list picker, writing through the destination's StateManager when it is open and into its file when it is not.
changelog/2026-08-11-keep-a-passing-test-run-quiet.md: the two parse-failure tests stub console.error and assert it was called, plus restoreMocks in vitest.config.ts, so a green run prints no stack traces.
changelog/2026-08-12-auto-move-cards-completed-from-a-dataview-or-tasks-query.md: issue #16 — auto-move becomes an invariant enforced on every parse and on closed board files (modify + startup), so a card ticked in a query moves whether or not the board is open.
changelog/2026-08-14-credit-the-fork-owner-in-the-plugin-manifest.md: manifest author/authorUrl/description credit j0rd1smit's fork so it is findable in Obsidian's installed-plugin list; id and name unchanged.
