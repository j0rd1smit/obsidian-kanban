import update from 'immutability-helper';
import { KanbanSettings } from 'src/Settings';
import { StateManager } from 'src/StateManager';
import { Board, Item } from 'src/components/types';
import { Path } from 'src/dnd/types';
import { getEntityFromPath, insertEntity, removeEntity, updateEntity } from 'src/dnd/util/data';
import { getTaskStatusDone, toggleTask } from 'src/parsers/helpers/inlineMetadata';

import type { BoardModifiers } from './boardModifiers';

export const DEFAULT_DONE_LANE_NAME = 'Done';

export interface AutoMoveDoneOptions {
  /** `auto-move-done-to-lane` */
  enabled: boolean;
  /** `done-lane-name`, matched against lane titles case-insensitively */
  laneName: string;
  /** `new-card-insertion-method`, decides top vs bottom of the done lane */
  insertionMethod?: 'prepend' | 'prepend-compact' | 'append';
}

/**
 * What clicking a card's checkbox does.
 *
 * With the Tasks plugin installed the toggle is delegated to it, so the card
 * picks up Tasks' completion date and, for a recurring task, splits into the
 * completed occurrence plus the next one. Without it we just flip the checkbox
 * ourselves. Either way the result goes through `completeItem`, which is what
 * moves a finished card to the done lane.
 */
export function toggleItemCheckbox(
  stateManager: StateManager,
  boardModifiers: Pick<BoardModifiers, 'completeItem'>,
  path: Path,
  item: Item
) {
  const updates = toggleTask(item, stateManager.file);

  if (updates) {
    const [itemStrings, checkChars, thisIndex] = updates;
    const replacements: Item[] = itemStrings.map((str, i) => {
      const next = stateManager.getNewItem(str, checkChars[i]);
      if (i === thisIndex) next.id = item.id;
      return next;
    });

    return boardModifiers.completeItem(path, replacements, thisIndex);
  }

  const next = update(item, {
    data: {
      checkChar: {
        $apply: (v: string) => (v === ' ' ? getTaskStatusDone() : ' '),
      },
      $toggle: ['checked'],
    },
  });

  return boardModifiers.completeItem(path, [next], 0);
}

/**
 * The three settings the auto-move reads, resolved through `getSetting`.
 *
 * `settings` is the per-board block to resolve against. Pass it when the board
 * those settings came from is not (yet) the state manager's current state — a
 * freshly parsed board, for instance.
 */
export function autoMoveDoneOptions(
  stateManager: Pick<StateManager, 'getSetting'>,
  settings?: KanbanSettings
): AutoMoveDoneOptions {
  return {
    enabled: !!stateManager.getSetting('auto-move-done-to-lane', settings),
    laneName: stateManager.getSetting('done-lane-name', settings) || DEFAULT_DONE_LANE_NAME,
    insertionMethod: stateManager.getSetting('new-card-insertion-method', settings),
  };
}

export function isItemComplete(item: Item): boolean {
  return !!item?.data.checked && item.data.checkChar === getTaskStatusDone();
}

/**
 * Whether a lane title is the configured done lane. Compared trimmed and
 * case-insensitively; a title reaches this with the `(n)` max-items suffix
 * already stripped, by `parseLaneTitle` on both the board and the file path.
 */
export function matchesLaneName(title: string, laneName: string): boolean {
  const target = laneName?.trim().toLowerCase();
  if (!target) return false;

  return title?.trim().toLowerCase() === target;
}

/** Index of the first lane whose title matches `laneName`, or -1. */
export function findLaneIndexByTitle(board: Board, laneName: string): number {
  return board.children.findIndex((lane) => matchesLaneName(lane.data.title, laneName));
}

function replaceInPlace(board: Board, path: Path, items: Item[]): Board {
  return insertEntity(removeEntity(board, path), path, items) as Board;
}

/**
 * Replace the item at `path` with `items`, moving `items[completedIndex]` to the
 * done lane when it came back complete and auto-move is on.
 *
 * `items` is what a checkbox toggle produced: normally a single item, but the
 * Tasks plugin turns a recurring task into two — the completed occurrence
 * (`completedIndex`) and the freshly scheduled one. Only the completed
 * occurrence travels; the new occurrence stays where the user left it.
 *
 * Note this deliberately does *not* run `maybeCompleteForMove` the way the drop
 * handler does. The checkbox already decided the card's completion state, and
 * re-deriving it from the destination lane would undo that.
 */
export function autoMoveDoneItem(
  board: Board,
  path: Path,
  items: Item[],
  completedIndex: number,
  options: AutoMoveDoneOptions
): Board {
  const completedItem = items[completedIndex];

  if (!options.enabled || !completedItem || !isItemComplete(completedItem)) {
    return replaceInPlace(board, path, items);
  }

  const sourceLaneIndex = path[0];
  const doneLaneIndex = findLaneIndexByTitle(board, options.laneName);

  // No such lane, or the card is already sitting in it
  if (doneLaneIndex === -1 || doneLaneIndex === sourceLaneIndex) {
    return replaceInPlace(board, path, items);
  }

  const staying = items.filter((_, i) => i !== completedIndex);
  const withoutCompleted = replaceInPlace(board, path, staying);

  const doneLane = withoutCompleted.children[doneLaneIndex];
  const insertIndex =
    (options.insertionMethod || 'append') === 'append' ? doneLane.children.length : 0;

  const moved = insertEntity(
    withoutCompleted,
    [doneLaneIndex, insertIndex],
    [completedItem]
  ) as Board;

  // A manual placement shouldn't be immediately re-sorted, same as a drop
  if (doneLane.data.sorted !== undefined) {
    return updateEntity(moved, [doneLaneIndex], { data: { $unset: ['sorted'] } }) as Board;
  }

  return moved;
}

/** Path of the card with this id, or undefined. */
function findItemPathById(board: Board, id: string): Path | undefined {
  for (let laneIndex = 0; laneIndex < board.children.length; laneIndex++) {
    const itemIndex = board.children[laneIndex].children.findIndex((item) => item.id === id);
    if (itemIndex !== -1) return [laneIndex, itemIndex];
  }
}

/**
 * The invariant the setting promises, applied to a whole board: with auto-move
 * on, a complete card does not sit outside the done lane.
 *
 * This is what catches a checkbox ticked outside the board — a Dataview or Tasks
 * query writes straight into the file, so none of the code above runs and the
 * board only sees the result when it parses the file again. There is nothing to
 * compare that parse against for a board that was closed at the time, so the
 * rule is the invariant rather than "was ticked a moment ago"; a card left
 * complete in the wrong lane is moved whenever the board is next parsed.
 *
 * Lists marked `**Complete**` are the way out: their cards are complete because
 * of the list, so they are left where they are. The archive is not a lane and is
 * never touched. `sweepCompletedCards` applies the same rule to a board file
 * that no view has open.
 */
export function autoMoveCompletedItems(board: Board, options: AutoMoveDoneOptions): Board {
  if (!options.enabled) return board;

  const doneLaneIndex = findLaneIndexByTitle(board, options.laneName);
  if (doneLaneIndex === -1) return board;

  const misplaced: string[] = [];
  board.children.forEach((lane, laneIndex) => {
    if (laneIndex === doneLaneIndex || lane.data.shouldMarkItemsComplete) return;
    for (const item of lane.children) {
      if (isItemComplete(item)) misplaced.push(item.id);
    }
  });

  // One at a time, re-finding each card: an earlier move shifts the paths
  return misplaced.reduce((next, id) => {
    const path = findItemPathById(next, id);
    if (!path) return next;

    const item = getEntityFromPath(next, path) as Item;
    return autoMoveDoneItem(next, path, [item], 0, options);
  }, board);
}
