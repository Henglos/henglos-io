import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IBoardSchema } from "../../../domain/entities/IBoard.schema.js";
import { CreateBoard } from "../board/CreateBoard.use-case.js";
import { CreateAction } from "../actions/CreateAction.use-case.js";
import { StartActionSchema } from "../../../domain/value-objects/StartAction.js";

const CORE_OWNER_ID = "core";

/** A new workflow on a board: its Start, no components, no wires. */
export class CreateWorkflow {
	private createBoard = new CreateBoard();
	private createAction = new CreateAction();

	execute(name: string, description: string, board: IBoardSchema, boardPackageId: string): IWorkflowRuntime {
		return {
			name,
			description,
			board: this.createBoard.execute(board, boardPackageId),
			start: this.createAction.execute(StartActionSchema, CORE_OWNER_ID),
			components: [],
			connections: [],
		};
	}
}
