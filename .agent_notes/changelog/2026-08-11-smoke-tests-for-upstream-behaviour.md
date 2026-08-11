# 2026-08-11 - Smoke tests for the behaviour inherited from upstream

**Why:** upstream has no tests and does not plan to add any — it is verified by
hand. That is workable for them and not for this fork, because every upstream
merge lands a pile of changes nobody here reviewed, in code nobody here wrote.
Without a signal, "did the merge break something" is only answerable by opening
Obsidian and clicking around, and the things most likely to break silently are
the ones a quick look does not reach: the on-disk format, the reparse that
preserves card ids, settings resolution.

The goal is a CI signal, not coverage. One assertion per user-visible behavior,
at the level a user would describe it ("a card dropped in a complete list gets
ticked off"), so a red build names what changed. Deliberately shallow: a suite
that fails on cosmetic upstream churn would get ignored, which is worse than not
having it. Fork code keeps being tested properly — this tier is only for code
this fork inherited.

**What:** Added `tests/upstream/`, 70 smoke tests across seven files covering
parsing, serialization, the board modifier API, drag and drop, settings
resolution, the state manager's reparse and write path, and the card date/time
pickers. All of it runs through the existing real-`StateManager` harness, so a
test asserts on markdown in and markdown out rather than on internals.

Two supporting pieces. `tests/fixtures/kitchen-sink.md` is a board that uses
every parser feature at once, stored in exactly the form `boardToMd` emits so
the round-trip test can be an exact string comparison — the loudest possible
alarm on a format change, which is the one thing this fork may not break.
`tests/helpers/drop.ts` reproduces the same-board branch of `handleDrop`, which
is a closure inside `DragDropApp` and cannot be called from a test; extracting
it from `src/` instead would have been a change to upstream code purely to suit
the tests, and this fork keeps upstream merges cheap.

Verified the suite is not vacuous by breaking three things in `src/` on purpose
— the WIP-limit regex, `moveEntity`'s sibling adjustment, and the multi-line
card indent — and checking that the tests named the failure each time.

`FakeKanbanView` grew `populateViewState` and a `getViewState` fallback to the
state manager, matching `KanbanView`. Several board modifiers splice
`list-collapse` with no fallback, so without it a test failed where the app
would not.
