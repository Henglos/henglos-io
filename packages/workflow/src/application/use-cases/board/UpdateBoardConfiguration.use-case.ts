import type { IBoardRuntime } from "../../../domain/entities/IBoard.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import { UpdateConfigurationValue } from "../configurations/UpdateConfigurationValue.js";

/** Sets one of the board's own configs, by name. */
export class UpdateBoardConfiguration {
	private updateValue = new UpdateConfigurationValue();

	execute(board: IBoardRuntime, name: string, value: IConfigurationRuntime["value"]): IBoardRuntime {
		const idx = board.configurations.findIndex(c => c.base.displayName === name);
		if (idx === -1) return board;
		const configurations = [...board.configurations];
		configurations[idx] = this.updateValue.execute(configurations[idx]!, value);
		return { ...board, configurations };
	}
}
