# 2026-08-11 - Move a card to another board from the card menu

**Why:** dragging a card to another board only works when both boards are open
side by side, which is impossible on a phone. Moving a card across boards should
be as quick as moving it to another list on the same board.

**What:** a "Move to other board" item in the card menu, which asks for a board
and then for one of that board's lists (loaded once the board is picked, since
they differ per board), moves the card, and confirms with a notice. Boards that
are open are written through their own `StateManager`; boards that are not are
edited as markdown, so the destination does not have to be open. See
`../architecture/cross-board-card-moves.md`.
