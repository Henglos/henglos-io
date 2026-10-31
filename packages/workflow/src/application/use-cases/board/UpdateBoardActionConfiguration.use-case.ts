import type { IBoardRuntime } from "../../../domain/entities/IBoard.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import { UpdateActionConfiguration } from "../actions/UpdateActionConfiguration.js";

/** Sets a config of one of the board's nodes to a value. */
export class UpdateBoardActionConfiguration {
	private updateAction = new UpdateActionConfiguration();

	execute(board: IBoardRuntime, actionId: string, configId: string, value: IConfigurationRuntime["value"]): IBoardRuntime {
		const idx = board.actions.findIndex(a => a.id === actionId);
		if (idx === -1) return board;
		const actions = [...board.actions];
		actions[idx] = this.updateAction.execute(actions[idx]!, configId, value);
		return { ...board, actions };
	}
}
