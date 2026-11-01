import {
	AddActionToWorkflowComponent,
	BindWorkflowActionConfigurationOutput,
	RemoveActionFromWorkflowComponent,
	SetWorkflowActionConfigurationCode,
	SetWorkflowActionNotes,
	SetWorkflowActionDisabled,
	SetWorkflowActionPassContext,
	AddSwitchCase,
	RemoveSwitchCase,
	SetPlatformSetting,
	AddWorkflowVariable,
	UpdateWorkflowVariable,
	RemoveWorkflowVariable,
	BindWorkflowActionConfigurationVariable,
	UpdateWorkflowActionConfiguration,
	findAddableComponent,
	findNodeSchema,
	type IWorkflowRuntime,
} from "@henglosio/workflow";
import type { WorkflowPatch } from "@henglosio/shared";

type DistributiveOmitPath<T> = T extends unknown ? Omit<T, "path"> : never;
export type WorkflowPatchInput = DistributiveOmitPath<WorkflowPatch>;

// Ops that only transform the workflow JSON — no package lookup, no driver
// sync — so with the collab doc open the studio applies them itself: instant,
// and written as local edits, which is what makes them undoable. Mirrors the
// matching operators in the hosting's UpdateWorkflowUseCase (same domain
// use-cases). add/remove:component and change:board stay server-side.
const LOCAL_OPS = new Set<WorkflowPatchInput["op"]>([
	"add:action",
	"remove:action",
	"update:configuration",
	"bind:configuration-output",
	"bind:configuration-code",
	"update:action-notes",
	"update:action-disabled",
	"update:action-pass-context",
	"add:switch-case",
	"remove:switch-case",
	"update:platform-setting",
	"add:variable",
	"update:variable",
	"remove:variable",
	"bind:configuration-variable",
	"add:connection",
	"remove:connection",
]);

export const canApplyLocally = (ops: WorkflowPatchInput[]) => ops.every(op => LOCAL_OPS.has(op.op));

const addAction = new AddActionToWorkflowComponent();
const removeAction = new RemoveActionFromWorkflowComponent();
const updateConfiguration = new UpdateWorkflowActionConfiguration();
const bindOutput = new BindWorkflowActionConfigurationOutput();
const setCode = new SetWorkflowActionConfigurationCode();
const setNotes = new SetWorkflowActionNotes();
const setDisabled = new SetWorkflowActionDisabled();
const setPassContext = new SetWorkflowActionPassContext();
const addSwitchCase = new AddSwitchCase();
const removeSwitchCase = new RemoveSwitchCase();
const setPlatformSetting = new SetPlatformSetting();
const addVariable = new AddWorkflowVariable();
const updateVariable = new UpdateWorkflowVariable();
const removeVariable = new RemoveWorkflowVariable();
const bindVariable = new BindWorkflowActionConfigurationVariable();

const applyOne = (runtime: IWorkflowRuntime, op: WorkflowPatchInput): IWorkflowRuntime => {
	switch (op.op) {
		case "add:action": {
			// The built-in Logic component is offered before it's in the workflow.
			const component = findAddableComponent(runtime, op.componentId);
			if (!component) return runtime;
			const schema = findNodeSchema(component, op.actionName);
			if (!schema) throw new Error(`Action "${op.actionName}" not found`);
			return addAction.execute(runtime, op.componentId, schema).workflow;
		}
		case "remove:action":
			return removeAction.execute(runtime, op.componentId, op.actionId).workflow;
		case "update:configuration":
			return updateConfiguration.execute(runtime, op.componentId, op.actionId, op.configurationId, op.value);
		case "bind:configuration-output":
			return bindOutput.execute(runtime, op.componentId, op.actionId, op.configurationId, op.sourceActionId, op.outputName);
		case "bind:configuration-code":
			return setCode.execute(runtime, op.componentId, op.actionId, op.configurationId, op.code);
		case "update:action-notes":
			return setNotes.execute(runtime, op.componentId, op.actionId, op.notes);
		case "update:action-disabled":
			return setDisabled.execute(runtime, op.componentId, op.actionId, op.disabled);
		case "update:action-pass-context":
			return setPassContext.execute(runtime, op.componentId, op.actionId, op.passContext);
		case "add:switch-case":
			return addSwitchCase.execute(runtime, op.componentId, op.actionId);
		case "remove:switch-case":
			return removeSwitchCase.execute(runtime, op.componentId, op.actionId, op.case);
		case "update:platform-setting":
			return setPlatformSetting.execute(runtime, op.key, op.value);
		case "add:variable":
			return addVariable.execute(runtime, op.variable).workflow;
		case "update:variable":
			return updateVariable.execute(runtime, op.variableId, { name: op.name, type: op.type, initial: op.initial, shape: op.shape });
		case "remove:variable":
			return removeVariable.execute(runtime, op.variableId);
		case "bind:configuration-variable":
			return bindVariable.execute(runtime, op.componentId, op.actionId, op.configurationId, op.variableId);
		case "add:connection":
			// Idempotent by id, like the server.
			return runtime.connections.some(c => c.id === op.connection.id)
				? runtime
				: { ...runtime, connections: [...runtime.connections, op.connection] };
		case "remove:connection":
			return { ...runtime, connections: runtime.connections.filter(c => c.id !== op.connectionId) };
		default:
			throw new Error(`Op "${op.op}" can't be applied locally`);
	}
};

/** Applies the ops in order, each on the previous result (same as the server's `ctx.target`). */
export const applyLocalWorkflowOps = (runtime: IWorkflowRuntime, ops: WorkflowPatchInput[]) =>
	ops.reduce(applyOne, runtime);
