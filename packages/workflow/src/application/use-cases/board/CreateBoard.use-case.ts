import { v4 } from "uuid";
import type { IBoardRuntime } from "../../../domain/entities/IBoard.runtime.js";
import type { IBoardSchema } from "../../../domain/entities/IBoard.schema.js";
import { CreateConfiguration } from "../configurations/CreateConfiguration.js";

/** The workflow's board from a board package's schema: its configs, its connection, no actions yet. */
export class CreateBoard {
	private createConfiguration = new CreateConfiguration();

	execute(base: IBoardSchema, packageId: string): IBoardRuntime {
		return {
			id: v4(),
			packageId,
			base,
			configurations: (base.configurations ?? []).map(c => this.createConfiguration.execute(c)),
			connection: null,
			actions: [],
		};
	}
}
