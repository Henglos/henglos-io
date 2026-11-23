import zod from "zod";
import {
	OperationSchema,
	AddOperationSchema,
	RemoveOperationSchema,
	ReplaceOperationSchema,
	CopyOperationSchema,
	MoveOperationSchema,
} from "hmutate";
import { ConnectionRuntime, ConfigurationValueSchema, ShapeSchema, VariableRuntime, VariableTypeSchema } from "@henglosio/workflow";

/** A workflow, summed up: its id, name, description and dates. */
export const WorkflowSchema = zod.object({
	id: zod.string(),
	name: zod.string(),
	description: zod.string(),
	createdAt: zod.string(),
	updatedAt: zod.string(),
});

/** A workflow with its data — everything the studio opens it with. */
export const FullWorkflowSchema = WorkflowSchema.extend({
	// @henglosio/hio-system version the workflow builds against (see change:platform).
	platform: zod.string(),
	data: zod.unknown(),
	// Its board's version was removed with no other to move it to: it has no
	// board until one is picked (change:board) — and can't be compiled.
	boardMissing: zod.boolean().optional(),
});

/** POST /workflows — a new workflow: its name, description, board and platform. */
export const CreateWorkflowInSchema = zod.object({
	name: zod.string(),
	description: zod.string(),
	boardId: zod.string(),
	platform: zod.string().optional(),
});

// The workflow's name and description (the hub's Edit) — a field left out is kept.
export const UpdateWorkflowMetadataOperationSchema = OperationSchema.extend({
	op: zod.literal("update:metadata"),
	name: zod.string().trim().min(1).max(80).optional(),
	description: zod.string().trim().min(1).max(1000).optional(),
});

/** Moves the workflow onto another board (one of the user's, by its install id). */
export const ChangeBoardOperationSchema = OperationSchema.extend({
	op: zod.literal("change:board"),
	packageId: zod.string(),
});

// The workflow's @henglosio/hio-system version (Workflow.platform — not part of
// `data`): server-side only, checked against what the board and every
// component accept, and followed by a driver sync.
export const ChangePlatformOperationSchema = OperationSchema.extend({
	op: zod.literal("change:platform"),
	version: zod.string().min(1),
});

// One override of the platform's runtime limits (workflow.data.platformSettings);
// `value` null drops it, back to the platform's default.
export const SetPlatformSettingOperationSchema = OperationSchema.extend({
	op: zod.literal("update:platform-setting"),
	key: zod.string().regex(/^[A-Z][A-Z0-9_]*$/),
	value: zod.number().int().nullable(),
});

// What the workflow picked for one of its board's options
// (workflow.data.boardOptions); `value` null drops it, back to the default.
export const SetBoardOptionOperationSchema = OperationSchema.extend({
	op: zod.literal("update:board-option"),
	key: zod.string().regex(/^[A-Z][A-Z0-9_]*$/),
	value: zod.union([zod.string(), zod.number(), zod.boolean()]).nullable(),
});

/** Removes a component — and its actions — from the workflow. */
export const RemoveComponentOperationSchema = OperationSchema.extend({
	op: zod.literal("remove:component"),
	componentId: zod.string(),
});

/** Adds a node: one of a component's actions, by name. */
export const AddActionOperationSchema = OperationSchema.extend({
	op: zod.literal("add:action"),
	componentId: zod.string(),
	actionName: zod.string(),
});

/** Removes a node — and its wires. */
export const RemoveActionOperationSchema = OperationSchema.extend({
	op: zod.literal("remove:action"),
	componentId: zod.string(),
	actionId: zod.string(),
});

/** Sets a node's config to a value. */
export const UpdateActionConfigurationOperationSchema = OperationSchema.extend({
	op: zod.literal("update:configuration"),
	componentId: zod.string(),
	actionId: zod.string(),
	configurationId: zod.string(),
	value: ConfigurationValueSchema,
});

/** Binds a node's config to an earlier node's output. */
export const BindActionConfigurationOutputOperationSchema = OperationSchema.extend({
	op: zod.literal("bind:configuration-output"),
	componentId: zod.string(),
	actionId: zod.string(),
	configurationId: zod.string(),
	sourceActionId: zod.string(),
	outputName: zod.string(),
});

/** Computes a node's config with a Code script. */
export const SetActionConfigurationCodeOperationSchema = OperationSchema.extend({
	op: zod.literal("bind:configuration-code"),
	componentId: zod.string(),
	actionId: zod.string(),
	configurationId: zod.string(),
	code: zod.string(),
});

/** A node's notes. */
export const SetActionNotesOperationSchema = OperationSchema.extend({
	op: zod.literal("update:action-notes"),
	componentId: zod.string(),
	actionId: zod.string(),
	notes: zod.string(),
});

/** Renames a node — empty: back to its action's own name. */
export const RenameActionOperationSchema = OperationSchema.extend({
	op: zod.literal("update:action-alias"),
	componentId: zod.string(),
	actionId: zod.string(),
	alias: zod.string().max(64),
});

// Switches an action off (skipped when the flow runs — see
// @henglosio/workflow's withoutDisabledActions) or back on.
export const SetActionDisabledOperationSchema = OperationSchema.extend({
	op: zod.literal("update:action-disabled"),
	componentId: zod.string(),
	actionId: zod.string(),
	disabled: zod.boolean(),
});

// Advanced › Pass Context — see @henglosio/workflow's PassContext.use-case.ts.
export const SetActionPassContextOperationSchema = OperationSchema.extend({
	op: zod.literal("update:action-pass-context"),
	componentId: zod.string(),
	actionId: zod.string(),
	passContext: zod.boolean(),
});

// Workflow variables — see @henglosio/workflow's WorkflowVariables.ts.
export const AddVariableOperationSchema = OperationSchema.extend({
	op: zod.literal("add:variable"),
	variable: VariableRuntime,
});

/** Changes a workflow variable: its name, type, initial value or shape. */
export const UpdateVariableOperationSchema = OperationSchema.extend({
	op: zod.literal("update:variable"),
	variableId: zod.string(),
	name: zod.string().optional(),
	type: VariableTypeSchema.optional(),
	// Checked against the (new) type by UpdateWorkflowVariable.
	initial: zod.union([zod.number(), zod.boolean(), zod.string(), zod.array(zod.unknown()), zod.record(zod.string(), zod.unknown())]).nullable().optional(),
	// A list / object variable's — what it holds.
	shape: ShapeSchema.optional(),
});

/** Removes a workflow variable. */
export const RemoveVariableOperationSchema = OperationSchema.extend({
	op: zod.literal("remove:variable"),
	variableId: zod.string(),
});

/** Binds a node's config to a workflow variable. */
export const BindActionConfigurationVariableOperationSchema = OperationSchema.extend({
	op: zod.literal("bind:configuration-variable"),
	componentId: zod.string(),
	actionId: zod.string(),
	configurationId: zod.string(),
	variableId: zod.string(),
});

/** Adds a component to the workflow (one of the user's, by its install id). */
export const AddComponentOperationSchema = OperationSchema.extend({
	op: zod.literal("add:component"),
	packageId: zod.string(),
});

/** Adds a wire. */
export const AddConnectionOperationSchema = OperationSchema.extend({
	op: zod.literal("add:connection"),
	connection: ConnectionRuntime,
});

/** Removes a wire. */
export const RemoveConnectionOperationSchema = OperationSchema.extend({
	op: zod.literal("remove:connection"),
	connectionId: zod.string(),
});

/** One operation of a workflow patch — a JSON Patch one, or one of the workflow's own. */
export const WorkflowPatchSchema = zod.discriminatedUnion("op", [
	AddOperationSchema,
	RemoveOperationSchema,
	ReplaceOperationSchema,
	CopyOperationSchema,
	MoveOperationSchema,

	UpdateWorkflowMetadataOperationSchema,
	ChangeBoardOperationSchema,
	ChangePlatformOperationSchema,
	SetPlatformSettingOperationSchema,
	SetBoardOptionOperationSchema,
	AddComponentOperationSchema,
	RemoveComponentOperationSchema,
	AddActionOperationSchema,
	AddConnectionOperationSchema,
	RemoveConnectionOperationSchema,
	RemoveActionOperationSchema,
	UpdateActionConfigurationOperationSchema,
	BindActionConfigurationOutputOperationSchema,
	SetActionConfigurationCodeOperationSchema,
	SetActionNotesOperationSchema,
	RenameActionOperationSchema,
	SetActionDisabledOperationSchema,
	SetActionPassContextOperationSchema,
	AddVariableOperationSchema,
	UpdateVariableOperationSchema,
	RemoveVariableOperationSchema,
	BindActionConfigurationVariableOperationSchema,
]);

/** PATCH /workflows/:id — the operations, applied in order. */
export const UpdateWorkflowInSchema = zod.object({
	patch: WorkflowPatchSchema.array(),
});

/** POST /workflows — the new workflow's id. */
export const CreateWorkflowOutSchema = zod.object({
	id: zod.string(),
});

// A workflow as the hub lists it: plus what it runs on and how big it is.
export const WorkflowListItemSchema = WorkflowSchema.extend({
	board: zod.string(),
	components: zod.number(),
	actions: zod.number(),
});

/** GET /workflows — a page of workflows (`nextSegment` absent on the last). */
export const ListWorkflowsOutSchema = zod.object({
	workflows: zod.array(WorkflowListItemSchema),
	nextSegment: zod.number().optional(),
});

/** PATCH /workflows/:id — the workflow after the patch. */
export const UpdateWorkflowOutSchema = zod.object({
	workflow: FullWorkflowSchema,
});

/** DELETE /workflows/:id — it's gone. */
export const DeleteWorkflowOutSchema = zod.object({
	status: zod.literal("deleted"),
});

/** A workflow, summed up: its id, name, description and dates. */
export type Workflow = zod.infer<typeof WorkflowSchema>;
/** One operation of a workflow patch — a JSON Patch one, or one of the workflow's own. */
export type WorkflowPatch = zod.infer<typeof WorkflowPatchSchema>;
/** POST /workflows — a new workflow: its name, description, board and platform. */
export type CreateWorkflowIn =zod.infer<typeof CreateWorkflowInSchema>;
/** PATCH /workflows/:id — the operations, applied in order. */
export type UpdateWorkflowIn = zod.infer<typeof UpdateWorkflowInSchema>;
/** POST /workflows — the new workflow's id. */
export type CreateWorkflowOut = zod.infer<typeof CreateWorkflowOutSchema>;
/** GET /workflows — a page of workflows (`nextSegment` absent on the last). */
export type ListWorkflowsOut = zod.infer<typeof ListWorkflowsOutSchema>;
// A workflow as the hub lists it: plus what it runs on and how big it is.
export type WorkflowListItem = zod.infer<typeof WorkflowListItemSchema>;
/** PATCH /workflows/:id — the workflow after the patch. */
export type UpdateWorkflowOut = zod.infer<typeof UpdateWorkflowOutSchema>;
/** DELETE /workflows/:id — it's gone. */
export type DeleteWorkflowOut = zod.infer<typeof DeleteWorkflowOutSchema>;
