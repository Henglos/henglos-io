import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IBoardRuntime } from "../../../domain/entities/IBoard.runtime.js";

/** Removes one of the board's nodes. */
export class RemoveActionFromBoard {
	execute(board: IBoardRuntime, actionId: string): { board: IBoardRuntime; action: IActionRuntime | undefined } {
		const action = board.actions.find(a => a.id === actionId);
		return {
			board: { ...board, actions: board.actions.filter(a => a.id !== actionId) },
			action,
		};
	}
}
