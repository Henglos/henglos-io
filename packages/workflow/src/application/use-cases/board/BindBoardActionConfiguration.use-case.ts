import type { IBoardRuntime } from "../../../domain/entities/IBoard.runtime.js";
import { SetConfigurationBinding } from "../configurations/SetConfigurationBinding.js";

/** Binds a config of one of the board's nodes to another action's. */
export class BindBoardActionConfiguration {
	private setBinding = new SetConfigurationBinding();

	execute(
		board: IBoardRuntime,
		actionId: string,
		configName: string,
		sourceActionId: string,
		sourceConfigName: string,
	): IBoardRuntime {
		const actionIdx = board.actions.findIndex(a => a.id === actionId);
		if (actionIdx === -1) return board;
		const action = board.actions[actionIdx]!;
		const configIdx = action.configurations.findIndex(c => c.base.displayName === configName);
		if (configIdx === -1) return board;
		const configurations = [...action.configurations];
		configurations[configIdx] = this.setBinding.execute(configurations[configIdx]!, sourceActionId, sourceConfigName);
		const actions = [...board.actions];
		actions[actionIdx] = { ...action, configurations };
		return { ...board, actions };
	}
}
