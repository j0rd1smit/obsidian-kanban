# Moving a card to another board

The card menu's "Move to other board" flow, and the two ways a card reaches a
destination board.

## The pieces

- `src/components/Item/ItemMenu.ts` adds the entry after the "Move to list" block, calling `promptMoveToBoard`.
- `src/components/Item/MoveToBoardPrompt.ts` is the UI: two `FuzzySuggestModal`s (board, then list) and the `Notice` at the end.
  Lists are loaded only after a board is picked, because they differ per board and the board may not be open.
  Boards are labelled by path minus `.md`, so two boards with the same basename stay distinguishable.
- `src/helpers/moveCardToBoard.ts` does the move: `listKanbanBoards`, `findOpenStateManager`, `getDestinationLanes`, `moveCardToBoard`.
- `src/helpers/boardMarkdown.ts` reads and edits a board **file** — `parseLanesFromMarkdown`, `parseCardsInLane`, `insertItemIntoLane`, `parseSettingsFromMarkdown` / `parseBoardSettings` — with no `StateManager` involved.
  The closed-board auto-move uses it too, see [card-completion.md](card-completion.md); it is the fork's one place for "edit a board that is not open".

## The two write paths

`plugin.stateManagers` only has an entry for a file some view has open, reached
here as `stateManager.getAView()?.plugin` (a type-only import, so the helper does
not pull `KanbanView` in at runtime and no import cycle forms).

That map is keyed by **file**, not by view (`main.ts:54`, `addView` at `:212`), so
"open" is a property of the board and not of the tab it is showing in. A board
open in a second tab, a split pane or a popped-out window is the same
`StateManager`, and `setState` fans out to all of them: `saveToDisk` assigns
`view.data` for every view in `viewSet` while only the primary calls
`requestSave()`, and every mounted component re-renders through `stateReceivers`.
Moving a card from a board in tab 1 to a board in tab 2 is therefore the ordinary
open case, with no per-tab handling anywhere in this feature.

- **Destination open**: `destination.setState(board => insertEntity(...))`, the same as the cross-board branch of `handleDrop`, including clearing the destination lane's `sorted`. The state manager saves it.
- **Destination closed**: `app.vault.process(file, md => ...)` splices `itemToMd(item)` into the right lane and leaves every other byte alone.

The open case must not take the file path: `view.requestSave()` is debounced, so
an open board can have a pending write that would clobber (or be clobbered by)
an edit made behind its back.

Both paths run `maybeCompleteForMove` so a card landing in a `**Complete**` list
gets ticked, and a recurring task leaves its next occurrence behind in the source
lane. The closed path has no destination `StateManager` to pass it, so it passes
the source's plus a one-lane stub board carrying the destination lane's
`shouldMarkItemsComplete` — only `titleRaw` and `checkChar` are used afterwards,
and neither depends on the destination's settings.

The source card is removed only after the destination write has succeeded.

## Gotchas

- Lane indices come from a list the user saw a moment ago. Both paths re-check the lane's title and, in the file path, fall back to finding it by title; a lane that has vanished aborts the move with the card still on the source board.
- Same for the card: `resolveItemPath` re-finds it by `item.id`, because the modal was open while the board could change.
- `parseLanesFromMarkdown` stops at the `***` archive separator and the settings footer, so archived cards are never a destination. It reads any ATX heading as a lane, the way `astToUnhydratedBoard` does.
- Card text crosses boards verbatim. Two boards with different `date-trigger` / `time-trigger` settings will render the same card differently — upstream's cross-board drag has the same behaviour.
- `itemToMd` in `src/parsers/formats/list.ts` is exported for this (upstream keeps it private). It is the only upstream change the feature needed.
