import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { ICredentialValueSchema } from "../../../domain/entities/IConfiguration.schema.js";

// The credentials a workflow's `type: credential` configs pick — every
// action's, disabled ones too — and the same values rewritten (an import
// clears the ones that aren't the importer's).

export const isCredentialValue = (value: unknown): value is ICredentialValueSchema =>
	!!value && typeof value === "object" && "credentialId" in value && typeof (value as ICredentialValueSchema).credentialId === "string";

const actionsOf = (workflow: IWorkflowRuntime): IActionRuntime[] =>
	[workflow.start, ...workflow.board.actions, ...workflow.components.flatMap(component => component.actions)];

/** Every credential id the workflow's configs pick — each once. */
export function workflowCredentialIds(workflow: IWorkflowRuntime): string[] {
	const found = new Set<string>();
	for (const action of actionsOf(workflow)) {
		for (const config of action.configurations) {
			if (config.base.type === "credential" && isCredentialValue(config.value)) found.add(config.value.credentialId);
		}
	}
	return [...found];
}

/** The workflow with every credential value passed through `map` (one it returns null for is cleared). */
export function mapWorkflowCredentialValues(workflow: IWorkflowRuntime, map: (value: ICredentialValueSchema) => ICredentialValueSchema | null): IWorkflowRuntime {
	const mapAction = (action: IActionRuntime): IActionRuntime => ({
		...action,
		configurations: action.configurations.map(config =>
			config.base.type === "credential" && isCredentialValue(config.value) ? { ...config, value: map(config.value) ?? undefined } : config),
	});
	return {
		...workflow,
		start: mapAction(workflow.start),
		board: { ...workflow.board, actions: workflow.board.actions.map(mapAction) },
		components: workflow.components.map(component => ({ ...component, actions: component.actions.map(mapAction) })),
	};
}
