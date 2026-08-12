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

## Completed from outside the board

A checkbox ticked in a `dataview` TASK query or a `tasks` query edits the board file directly, so none of the above runs.
Obsidian re-reads the file into the primary view (`setViewData` -> `KanbanPlugin.addView` -> `StateManager.registerView` -> `newBoard`), and that is where the second entry point sits:

- `autoMoveExternallyCompletedItems(previous, next, options)` diffs the board that was just parsed against the one it replaces, by **entity id**, and moves every card that went from incomplete to complete and is not already in the done lane.
  It hands each one to `autoMoveDoneItem`, re-finding the path per card because an earlier move shifts the later ones.
  Ids survive a reparse only because of the diff/patch step in `ListFormat.mdToBoard`, see [parsing.md](parsing.md).
- Only a transition counts. A card that is new to this parse has no previous entry and is left alone, which is what keeps a hand-typed `- [x]` line, and every card that was already complete when the board was opened, where the user put it.
- `newBoard` saves only when something moved (`setState(board, board !== parsed)`), so a plain reload never writes and the write it does make settles on the next reload instead of looping.
- `autoMoveDoneOptions(stateManager, settings?)` resolves the three settings for both entry points. `newBoard` passes the freshly parsed board's settings, because `stateManager.state` is still the board about to be replaced.

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

- The external path needs the board **open**. A card ticked in a query while its board is closed stays put: the first parse has no previous board to compare against, and `previous` being undefined is exactly what stops a freshly opened board from being rearranged.
- It also needs the ids to survive. When the previous state carries a parse error, `mdToBoard` skips the diff and returns fresh ids, so no card matches and nothing moves — a safe failure, but it does mean a board in an error state silently loses the behavior until the error clears.
- `tests/helpers/harness.ts` `externalChange(md)` is the test stand-in for Obsidian re-reading the file; it goes through the real `registerView` -> `newBoard`.
