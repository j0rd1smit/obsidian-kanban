# Completing a card (checkbox, auto-move)

`src/helpers/completeItem.ts` owns what happens when a card is completed, from a click or from outside the board.
Fork-specific behavior, see the changelog entries for auto-move-to-done and for the recurring list.

- `toggleItemCheckbox(stateManager, boardModifiers, path, item)` is the whole handler;
  `ItemCheckbox` (used by both the board and the table view) just calls it.
  With the Tasks plugin it delegates to `toggleTask`, which returns `[itemStrings, checkChars, thisIndex]`
  where `thisIndex` is the **completed** occurrence — a recurring task yields two strings, the other being the newly scheduled one.
  Without Tasks it flips `checked` / `checkChar` itself.
- Both paths end in `boardModifiers.completeItem(path, items, completedIndex)`, which resolves the settings and calls `autoMoveDoneItem`.
- `autoMoveDoneItem(board, path, items, completedIndex, options)` is pure. It picks a destination lane per item, then
  replaces the source position with whatever is not travelling (`insertEntity(removeEntity(...))`) and inserts each traveller into its lane via `insertIntoLane`, which appends or prepends per `new-card-insertion-method` and `$unset`s that lane's `sorted`.
  With nothing to move it is a plain in-place replace — the case when the settings are off, no lane matches, the card is already in the destination lane, or the toggle did not leave the card complete.
- Two independent destinations, each with its own on/off setting:
  the **completed** occurrence goes to the done lane, and **every other item** the toggle produced — only ever the next occurrence of a recurring task — goes to the recurring lane.
  Either can be on without the other. `insertIntoLane` re-reads the lane per call, so both landing in the same lane still appends in order (completed first).

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

## The recurring lane

`move-recurring-to-lane` sends the occurrence the Tasks plugin schedules to `recurring-lane-name` instead of leaving it where the completed card was.

- Only the checkbox path implements it, because it is the only place a card is known to be a *new* occurrence.
  A recurrence created by a Dataview / Tasks query is written into the file by the Tasks plugin, and by the time the board parses it, it is an ordinary incomplete card — indistinguishable from one that was always there.
  So neither `autoMoveCompletedItems` nor `sweepCompletedCards` routes it, and neither has a reason to: the invariant they enforce is about *complete* cards.
- The drop path (`maybeCompleteForMove`, see [drag-and-drop.md](drag-and-drop.md)) also splits a recurring card, and leaves the new occurrence at the drag position via `moveEntity`'s replacement callback. It is not covered — doing so means changing upstream drop handling in `DragDropApp.tsx` and `moveCardToBoard.ts`.

## Settings

`auto-move-done-to-lane` (bool, default off) and `done-lane-name` (string, default `Done`), plus `move-recurring-to-lane` (bool, default off) and `recurring-lane-name` (string, default `Recurring`).
Lane names are matched trimmed + case-insensitively against `lane.data.title`, by `matchesLaneName`.
None of the four is in `compiledSettings` or `shouldRefreshBoard` — they don't affect parsing, and reading them through `getSetting` keeps a per-board change effective immediately.
Insert position inside either destination lane reuses `new-card-insertion-method`.
One set of settings covers both entry points; there is no separate toggle for the external one.

## Gotchas

- The invariant has no memory, by design. A card left complete outside the done list from before the setting was turned on is moved the first time its board is parsed or swept, not only cards ticked just now. `**Complete**` on a list is the only opt-out.
- The two enforcement paths are separate implementations of one rule — the in-memory one over `Board`, the file one over lines — because a closed board cannot be parsed. They can drift; `tests/sweepCompletedCards.test.ts` pins that both land the card in the same place.
- The file sweep only moves a card whose line the serializer would have written (`- [x] ` at the start of a line, continuation lines indented). Anything it does not recognise is left alone rather than guessed at.
- A board open in a **markdown** view has no `StateManager`, so the sweep treats it as closed and may rewrite the file under the editor. Obsidian merges the change back, but a save from that editor can still win and undo the move.
- `tests/helpers/harness.ts` `externalChange(md)` is the test stand-in for Obsidian re-reading the file; it goes through the real `registerView` -> `newBoard`.
- `move-recurring-to-lane` does nothing without the Tasks plugin: no plugin, no split, so `items` is one card and there is no new occurrence to route. Same for an *uncheck*, which never splits — `autoMoveDoneItem` only treats the other items as a recurrence when the toggle left the card complete.
- `autoMoveCompletedItems` calls `autoMoveDoneItem` with a single item, so the recurring branch is dead on that path by construction, whatever the settings say.
