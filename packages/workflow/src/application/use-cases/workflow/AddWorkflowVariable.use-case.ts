import { v4 } from "uuid";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IVariableRuntime, IVariableType } from "../../../domain/entities/IVariable.runtime.js";
import type { IShape } from "../../../domain/schemas/ISchema.schema.js";
import { shapeFits, validateVariableName, withVariablesComponent, workflowVariableInitialError, type VariableInitial } from "./WorkflowVariables.js";

/** Adds a workflow variable — its name checked, its initial value checked against its type. */
export class AddWorkflowVariable {
	execute(workflow: IWorkflowRuntime, variable: { id?: string; name: string; type: IVariableType; initial: VariableInitial; shape?: IShape }): { workflow: IWorkflowRuntime; variable?: IVariableRuntime } {
		if (validateVariableName(workflow, variable.name)) return { workflow };
		if (!shapeFits(variable.type, variable.shape)) return { workflow };
		if (workflowVariableInitialError(workflow, variable.type, variable.initial, variable.shape)) return { workflow };
		const created: IVariableRuntime = {
			id: variable.id ?? v4(), name: variable.name, type: variable.type, initial: variable.initial,
			...(variable.shape !== undefined && { shape: variable.shape }),
		};
		const next = withVariablesComponent(workflow);
		return { workflow: { ...next, variables: [...(next.variables ?? []), created] }, variable: created };
	}
}
