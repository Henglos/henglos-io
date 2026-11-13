import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IHandlerRuntime } from "../../../domain/entities/IHandler.runtime.js";

/** An action's input handle, by id. */
export class FindActionInput {
	execute(action: IActionRuntime, id: string): IHandlerRuntime | undefined {
		return action.inputs.find(h => h.id === id);
	}
}
