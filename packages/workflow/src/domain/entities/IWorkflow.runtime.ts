import zod from "zod";
import { BoardRuntime } from "./IBoard.runtime.js";
import { ComponentRuntime } from "./IComponent.runtime.js";
import { ConnectionRuntime } from "./IConnection.runtime.js";
import { ActionRuntime } from "./IAction.runtime.js";
import { VariableRuntime } from "./IVariable.runtime.js";
import { withTriggerNodesRaw } from "../value-objects/TriggerNodes.js";

// withTriggerNodesRaw: trigger nodes saved with an input come back without one.
export const WorkflowRuntime = zod.preprocess(raw => withTriggerNodesRaw(raw), zod.object({
	name: zod.string(),
	description: zod.string(),
	board: BoardRuntime,
	start: ActionRuntime,
	components: zod.array(ComponentRuntime),
	connections: zod.array(ConnectionRuntime),
	// Optional: workflows saved before variables existed don't carry it — read with `?? []`.
	variables: zod.array(VariableRuntime).optional(),
	// Overrides of the platform's runtime limits (its manifest's `settings`,
	// by SystemConfig key), compiled into the board's runtime by the
	// platform's build. Absent / missing key: the platform's default.
	platformSettings: zod.record(zod.string(), zod.number().int()).optional(),
	// What it picked for its board's options (the board's `options`, by key),
	// handed to the board's firmware script. Absent / missing key: the default.
	boardOptions: zod.record(zod.string(), zod.union([zod.string(), zod.number(), zod.boolean()])).optional(),
}));

// withTriggerNodesRaw: trigger nodes saved with an input come back without one.
export type IWorkflowRuntime = zod.infer<typeof WorkflowRuntime>;
