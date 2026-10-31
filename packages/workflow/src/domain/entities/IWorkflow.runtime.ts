import zod from "zod";
import { BoardRuntime } from "./IBoard.runtime.js";
import { ComponentRuntime } from "./IComponent.runtime.js";
import { ConnectionRuntime } from "./IConnection.runtime.js";
import { ActionRuntime } from "./IAction.runtime.js";
import { VariableRuntime } from "./IVariable.runtime.js";
import { withTriggerNodesRaw } from "../value-objects/TriggerNodes.js";
import { withPythonKinds } from "../schemas/IKSchema.schema.js";

// withTriggerNodesRaw: trigger nodes saved with an input come back without one.
// withPythonKinds: types saved by width (int32, uint8…) come back as int / float.
export const WorkflowRuntime = zod.preprocess(raw => withTriggerNodesRaw(withPythonKinds(raw)), zod.object({
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
}));

// withTriggerNodesRaw: trigger nodes saved with an input come back without one.
// withPythonKinds: types saved by width (int32, uint8…) come back as int / float.
export type IWorkflowRuntime = zod.infer<typeof WorkflowRuntime>;
