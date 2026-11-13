import type { BoardOptionValue } from "../../../domain/entities/IBoard.schema.js";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";

/**
 * Picks a value for one of the board's options in this workflow, or — with
 * `value` null — drops it, back to the option's default. Which keys exist and
 * their valid values belong to the board (its manifest's `options`): the studio
 * checks them, and the build checks again.
 */
export class SetBoardOption {
	execute(workflow: IWorkflowRuntime, key: string, value: BoardOptionValue | null): IWorkflowRuntime {
		const { [key]: _previous, ...rest } = workflow.boardOptions ?? {};
		const boardOptions = value === null ? rest : { ...rest, [key]: value };
		if (Object.keys(boardOptions).length === 0) {
			const { boardOptions: _dropped, ...withoutOptions } = workflow;
			return withoutOptions;
		}
		return { ...workflow, boardOptions };
	}
}
