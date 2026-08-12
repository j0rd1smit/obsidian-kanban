# Completing a card (checkbox, auto-move)

`src/helpers/completeItem.ts` owns what happens when a card is completed, from a click or from outside the board.
Fork-specific behavior, see the changelog entry for auto-move-to-done.

- `toggleItemCheckbox(stateManager, boardModifiers, path, item)` is the whole handler;
  `ItemCheckbox` (used by both the board and the table view) just calls it.
  With the Tasks plugin it delegates to `toggleTask`, which returns `[itemStrings, checkChars, thisIndex]`
  where `thisIndex` is the **completed** occurrence — a recurring task yields two strings, the other being the newly scheduled one.
  Without Tasks it flips `checked` / `checkChar` itself.
- Both paths end in `boardModifiers.completeItem(path, items, completedIndex)`, which resolves the settings and calls `autoMoveDoneItem`.
- `autoMoveDoneItem(board, path, items, completedIndex, options)` is pure and does the replace-then-move:
  `insertEntity(removeEntity(...))` in the source lane with the items that stay, then `insertEntity` of the completed one into the done lane, then `$unset` `sorted` there.
  It short-circuits to a plain in-place replace when the feature is off, no lane matches, the card is already in the done lane, or the toggle did not leave the card complete.

## The invariant, and completing a card from outside the board

A checkbox ticked in a `dataview` TASK query or a `tasks` query edits the board file directly, so none of the above runs.
The board is usually **closed** when that happens — working from the query instead of the board is the point of having one — and a closed board has no `StateManager`, no parsed `Board`, and nothing to compare a later parse against.
So the rule is not "was ticked a moment ago" but the invariant the setting promises:

> with `auto-move-done-to-lane` on, a complete card does not sit outside the done lane.

Lists marked `**Complete**` are the way out of it: their cards are complete because of the list, so they are skipped. The archive is not a lane and is never touched.
It is enforced in three places, the checkbox handler above being the first:

- **Every parse of a board**: `autoMoveCompletedItems(board, options)` (`src/helpers/completeItem.ts`) collects the misplaced cards and hands each to `autoMoveDoneItem`, re-finding the path per card because an earlier move shifts the later ones.
  `StateManager.newBoard` runs it on the board it just parsed and saves only when something moved (`setState(board, board !== parsed)`), so a plain reload never writes and the write it does make settles on the next reload instead of looping.
  This is the path an **open** board takes when the file changes under it (`setViewData` -> `KanbanPlugin.addView` -> `StateManager.registerView` -> `newBoard`).
- **The file, for a closed board**: `src/helpers/sweepCompletedCards.ts`, below.
- `autoMoveDoneOptions(stateManager, settings?)` resolves the three settings for the in-memory paths. `newBoard` passes the freshly parsed board's settings, because `stateManager.state` is still the board about to be replaced.

## The closed-board sweep

`src/helpers/sweepCompletedCards.ts` applies the same rule to a board **file**, as text.

- `sweepCompletedCards(md, options)` returns the rewritten markdown, or `null` when there is nothing to move.
  It reads the lists with `parseLanesFromMarkdown`, the cards with `parseCardsInLane`, splices the complete ones out back-to-front, then puts each into the done list with `insertItemIntoLane`, re-reading the lists per insert.
  Removing a card's lines leaves exactly what `boardToMd` would have written, including for a list that ends up empty, so the file does not drift.
  See [cross-board-card-moves.md](cross-board-card-moves.md) for `boardMarkdown.ts`, which both features share.
- `boardFileAutoMoveOptions(md, globalSettings)` is the settings resolution with no board in memory: `parseBoardSettings` (footer, overridden by frontmatter setting keys, the way `parseMarkdown` does it), falling back to the global settings.
- `sweepBoardFile(app, file, globalSettings)` reads with `cachedRead` to decide whether there is work, then writes through `vault.process` so an edit landing in between is not clobbered.
- `ClosedBoardSweeper` is the plugin-level driver, constructed in `main.ts:onload`:
  `queue(file)` from `vault.on('modify')`, debounced 2s; `sweepAll()` from `onLayoutReady`, for what was ticked while Obsidian was not running.
  Both skip files that have a `StateManager` — an open board handles itself through the parse path.
  Whether a file is a board is decided when the queue drains, not when it is queued, because the metadata cache may not have caught up with the change yet.

## Why it does not reuse the drop handler

- It does **not** use `moveEntity`, because the source and destination lanes are always different, and the "insertion index vs target index" adjustment `moveEntity` makes only applies to siblings.
  See [drag-and-drop.md](drag-and-drop.md).
- It deliberately does **not** run `maybeCompleteForMove` the way the drop handler does: the checkbox already decided the card's completion state, and re-deriving it from the destination lane's `shouldMarkItemsComplete` would undo the user's click.

## Settings

`auto-move-done-to-lane` (bool, default off) and `done-lane-name` (string, default `Done`, matched trimmed + case-insensitively against `lane.data.title`).
Neither is in `compiledSettings` or `shouldRefreshBoard` — they don't affect parsing, and reading them through `getSetting` keeps a per-board change effective immediately.
Insert position inside the done lane reuses `new-card-insertion-method`.
One pair of settings covers both entry points; there is no separate toggle for the external one.

## Gotchas

- The invariant has no memory, by design. A card left complete outside the done list from before the setting was turned on is moved the first time its board is parsed or swept, not only cards ticked just now. `**Complete**` on a list is the only opt-out.
- The two enforcement paths are separate implementations of one rule — the in-memory one over `Board`, the file one over lines — because a closed board cannot be parsed. They can drift; `tests/sweepCompletedCards.test.ts` pins that both land the card in the same place.
- The file sweep only moves a card whose line the serializer would have written (`- [x] ` at the start of a line, continuation lines indented). Anything it does not recognise is left alone rather than guessed at.
- A board open in a **markdown** view has no `StateManager`, so the sweep treats it as closed and may rewrite the file under the editor. Obsidian merges the change back, but a save from that editor can still win and undo the move.
- `tests/helpers/harness.ts` `externalChange(md)` is the test stand-in for Obsidian re-reading the file; it goes through the real `registerView` -> `newBoard`.
