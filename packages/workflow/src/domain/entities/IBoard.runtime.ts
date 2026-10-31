import zod from "zod";
import { BoardConnectionStateSchema, BoardSchema } from "./IBoard.schema.js";
import { ConfigurationRuntime } from "./IConfiguration.runtime.js";
import { ActionRuntime } from "./IAction.runtime.js";

/**
 * The workflow's board: its package's schema, its configs' values, how the driver reaches it,
 * and the nodes of its own actions.
 */
export const BoardRuntime = zod.object({
	id: zod.string(),
	packageId: zod.string(),
	base: BoardSchema,
	configurations: zod.array(ConfigurationRuntime),
	connection: BoardConnectionStateSchema.nullable(),
	actions: zod.array(ActionRuntime)
});

/**
 * The workflow's board: its package's schema, its configs' values, how the driver reaches it,
 * and the nodes of its own actions.
 */
export type IBoardRuntime = zod.infer<typeof BoardRuntime>;
