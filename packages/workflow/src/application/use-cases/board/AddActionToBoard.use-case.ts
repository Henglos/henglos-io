import type { IActionSchema } from "../../../domain/entities/IAction.schema.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IBoardRuntime } from "../../../domain/entities/IBoard.runtime.js";
import { CreateAction } from "../actions/CreateAction.use-case.js";

/** Adds a node of one of the board's own actions. */
export class AddActionToBoard {
	private createAction = new CreateAction();

	execute(board: IBoardRuntime, action: IActionSchema): { board: IBoardRuntime; action: IActionRuntime } {
		const actionRuntime = this.createAction.execute(action, board.id);
		return {
			board: { ...board, actions: [...board.actions, actionRuntime] },
			action: actionRuntime,
		};
	}
}
