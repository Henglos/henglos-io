import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IHandlerRuntime } from "../../../domain/entities/IHandler.runtime.js";

/** An action's input or output handle, by id. */
export class FindActionHandler {
	findInput(action: IActionRuntime, id: string): IHandlerRuntime | undefined {
		return action.inputs.find(h => h.id === id);
	}

	findOutput(action: IActionRuntime, id: string): IHandlerRuntime | undefined {
		return action.outputs.find(h => h.id === id);
	}
}
