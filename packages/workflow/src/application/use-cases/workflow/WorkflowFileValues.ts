import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IFileValueSchema } from "../../../domain/entities/IConfiguration.schema.js";

// The files a workflow's `type: file` configs point at — every action's,
// disabled ones too (what an export carries), and the same values rewritten
// (an import gives the files new ids).

export const isFileValue = (value: unknown): value is IFileValueSchema =>
	!!value && typeof value === "object" && "fileId" in value && "sha256" in value;

const actionsOf = (workflow: IWorkflowRuntime): IActionRuntime[] =>
	[workflow.start, ...workflow.board.actions, ...workflow.components.flatMap(component => component.actions)];

/** Every file value the workflow's configs hold — each fileId once. */
export function workflowFileValues(workflow: IWorkflowRuntime): IFileValueSchema[] {
	const found = new Map<string, IFileValueSchema>();
	for (const action of actionsOf(workflow)) {
		for (const config of action.configurations) {
			if (config.base.type === "file" && isFileValue(config.value)) found.set(config.value.fileId, config.value);
		}
	}
	return [...found.values()];
}

/** The workflow with every file value passed through `map` (a config whose value it returns null for is cleared). */
export function mapWorkflowFileValues(workflow: IWorkflowRuntime, map: (value: IFileValueSchema) => IFileValueSchema | null): IWorkflowRuntime {
	const mapAction = (action: IActionRuntime): IActionRuntime => ({
		...action,
		configurations: action.configurations.map(config =>
			config.base.type === "file" && isFileValue(config.value) ? { ...config, value: map(config.value) ?? undefined } : config),
	});
	return {
		...workflow,
		start: mapAction(workflow.start),
		board: { ...workflow.board, actions: workflow.board.actions.map(mapAction) },
		components: workflow.components.map(component => ({ ...component, actions: component.actions.map(mapAction) })),
	};
}
