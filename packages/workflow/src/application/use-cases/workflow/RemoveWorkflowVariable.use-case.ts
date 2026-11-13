import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";

/**
 * Drops the variable. Configs bound to it, and Set actions writing it, keep
 * pointing at its id — same as an output binding whose source was removed:
 * the studio flags them and the build leaves them out.
 */
export class RemoveWorkflowVariable {
	execute(workflow: IWorkflowRuntime, variableId: string): IWorkflowRuntime {
		const variables = workflow.variables ?? [];
		if (!variables.some(variable => variable.id === variableId)) return workflow;
		return { ...workflow, variables: variables.filter(variable => variable.id !== variableId) };
	}
}
