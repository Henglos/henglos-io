import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IHandlerRuntime } from "../../../domain/entities/IHandler.runtime.js";

/** An action's output handle, by id. */
export class FindActionOutput {
	execute(action: IActionRuntime, id: string): IHandlerRuntime | undefined {
		return action.outputs.find(h => h.id === id);
	}
}
