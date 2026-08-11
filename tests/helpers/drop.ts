import update from 'immutability-helper';
import { StateManager } from 'src/StateManager';
import { maybeCompleteForMove } from 'src/components/helpers';
import { Board, DataTypes } from 'src/components/types';
import { Path } from 'src/dnd/types';
import { getEntityFromPath, moveEntity, updateEntity } from 'src/dnd/util/data';

import { FakeKanbanView } from './harness';

/**
 * A drop, without the pointer.
 *
 * `handleDrop` in `src/DragDropApp.tsx` is a closure inside a Preact component,
 * so a test cannot call it. This mirrors its same-board branch — `moveEntity`
 * plus `maybeCompleteForMove` on both callbacks, the `list-collapse` splice for
 * a list, and clearing `sorted` on the destination — which is also what
 * `.agent_notes/architecture/drag-and-drop.md` tells anyone building a
 * synthetic move to compose.
 *
 * Because it is a copy, it guards the pieces (`moveEntity`, the completion
 * transform, the path arithmetic), not the wiring in `DragDropApp` itself.
 *
 * `dropPath` is an insertion index, not a target index: `moveEntity` subtracts
 * one when source and destination are siblings and the source sits first.
 */
export function drop(
  stateManager: StateManager,
  view: FakeKanbanView,
  dragPath: Path,
  dropPath: Path,
  { inDropArea = false }: { inDropArea?: boolean } = {}
) {
  const path = inDropArea ? [...dropPath, 0] : dropPath;

  return stateManager.setState((board) => {
    const entity = getEntityFromPath(board, dragPath);
    const newBoard: Board = moveEntity(
      board,
      dragPath,
      path,
      (entity) => {
        if (entity.type === DataTypes.Item) {
          const { next } = maybeCompleteForMove(
            stateManager,
            board,
            dragPath,
            stateManager,
            board,
            path,
            entity as any
          );
          return next;
        }
        return entity;
      },
      (entity) => {
        if (entity.type === DataTypes.Item) {
          const { replacement } = maybeCompleteForMove(
            stateManager,
            board,
            dragPath,
            stateManager,
            board,
            path,
            entity as any
          );
          return replacement;
        }
      }
    );

    if (entity.type === DataTypes.Lane) {
      const from = dragPath.last();
      let to = path.last();

      if (from < to) to -= 1;

      const collapsedState: boolean[] = view.getViewState('list-collapse') || [];
      const op = (collapsedState: boolean[]) => {
        const newState = [...collapsedState];
        newState.splice(to, 0, newState.splice(from, 1)[0]);
        return newState;
      };

      view.setViewState('list-collapse', undefined, op);

      return update<Board>(newBoard, {
        data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
      });
    }

    const destinationParentPath = path.slice(0, -1);
    const destinationParent = getEntityFromPath(board, destinationParentPath);

    if (destinationParent?.data?.sorted !== undefined) {
      return updateEntity(newBoard, destinationParentPath, {
        data: { $unset: ['sorted'] },
      }) as Board;
    }

    return newBoard;
  });
}
