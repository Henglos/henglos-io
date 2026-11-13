import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { isStructuredVariableType, type IVariableRuntime, type IVariableType } from "../../../domain/entities/IVariable.runtime.js";
import type { IShape } from "../../../domain/schemas/ISchema.schema.js";
import { shapeFits, validateVariableName, workflowVariableInitialError, type VariableInitial } from "./WorkflowVariables.js";

/** Changes a workflow variable: its name, type, initial value or shape. */
export class UpdateWorkflowVariable {
	execute(workflow: IWorkflowRuntime, variableId: string, changes: { name?: string; type?: IVariableType; initial?: VariableInitial; shape?: IShape }): IWorkflowRuntime {
		const variables = workflow.variables ?? [];
		const current = variables.find(variable => variable.id === variableId);
		if (!current) return workflow;
		if (changes.name !== undefined && validateVariableName(workflow, changes.name, variableId)) return workflow;

		const type = changes.type ?? current.type;
		// A list / object keeps its shape unless one is given; a simple type has none.
		const shape = isStructuredVariableType(type) ? (changes.shape ?? (changes.type ? undefined : current.shape)) : undefined;
		if (!shapeFits(type, shape)) return workflow;
		// A type (or shape) change without a new initial value keeps the old one only if it still fits.
		const initial = changes.initial !== undefined
			? changes.initial
			: workflowVariableInitialError(workflow, type, current.initial, shape) ? null : current.initial;
		if (workflowVariableInitialError(workflow, type, initial, shape)) return workflow;

		const { shape: _previous, ...rest } = current;
		const updated: IVariableRuntime = { ...rest, name: changes.name ?? current.name, type, initial, ...(shape !== undefined && { shape }) };
		return { ...workflow, variables: variables.map(variable => variable.id === variableId ? updated : variable) };
	}
}
