import type { IBoardRuntime } from "../../../domain/entities/IBoard.runtime.js";
import { ClearConfigurationBinding } from "../configurations/ClearConfigurationBinding.js";

/** Unbinds a config of one of the board's nodes. */
export class ClearBoardActionConfigurationBinding {
	private clearBinding = new ClearConfigurationBinding();

	execute(board: IBoardRuntime, actionId: string, configId: string): IBoardRuntime {
		const actionIdx = board.actions.findIndex(a => a.id === actionId);
		if (actionIdx === -1) return board;
		const action = board.actions[actionIdx]!;
		const configIdx = action.configurations.findIndex(c => c.id === configId);
		if (configIdx === -1) return board;
		const configurations = [...action.configurations];
		configurations[configIdx] = this.clearBinding.execute(configurations[configIdx]!);
		const actions = [...board.actions];
		actions[actionIdx] = { ...action, configurations };
		return { ...board, actions };
	}
}
