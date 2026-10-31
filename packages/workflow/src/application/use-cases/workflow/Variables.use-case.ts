import { v4 } from "uuid";
import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import { isStructuredVariableType, VARIABLE_NAME_PATTERN, variableInitialError, type IVariableRuntime, type IVariableType } from "../../../domain/entities/IVariable.runtime.js";
import type { IShape } from "../../../domain/schemas/IKSchema.schema.js";
import { isListShape, isObjectShape } from "../../../domain/value-objects/ShapeValue.js";
import { isVariablesComponent, VARIABLES_PACKAGE_ID, VariablesComponentSchema } from "../../../domain/value-objects/VariablesComponent.js";
import { CreateComponent } from "../component/CreateComponent.use-case.js";
import { generateId } from "../../../utils/identifier.js";
import { protocolLimits } from "../../../domain/value-objects/ProtocolLimits.js";

/** Why `initial` can't be a `type` value in this workflow (its MAX_DATA_BUFFER bounds text, and a list's / object's JSON). */
export const workflowVariableInitialError = (workflow: Pick<IWorkflowRuntime, "platformSettings">, type: IVariableType, initial: unknown, shape?: IShape) =>
	variableInitialError(type, initial, protocolLimits(workflow).maxData, shape);

/** Whether `shape` is what a `type` variable holds — a list shape for "array", an object one for "object", none otherwise. */
const shapeFits = (type: IVariableType, shape: IShape | undefined) =>
	type === "array" ? isListShape(shape) : type === "object" ? isObjectShape(shape) : shape === undefined;

// VARIABLE_ID on the wire — the platform's GlobalVariables key, also what
// `ctx.var(name)` hashes on the board (ScriptContext.var). Case-insensitive.
export const computeWireVariableId = (name: string) => generateId(`var/${name}`.toLowerCase());

/**
 * Why `name` can't be a variable name, or null when it can. Names are
 * identifiers (they show up in scripts as `ctx.var("name")`), unique
 * case-insensitively, and their wire ids must not collide (16-bit hash).
 */
export const validateVariableName = (workflow: IWorkflowRuntime, name: string, exceptId?: string): string | null => {
	if (!VARIABLE_NAME_PATTERN.test(name)) return "Use letters, digits and _ (not starting with a digit), up to 24 characters.";
	const others = (workflow.variables ?? []).filter(variable => variable.id !== exceptId);
	if (others.some(variable => variable.name.toLowerCase() === name.toLowerCase())) return `There's already a variable called "${name}".`;
	const wireId = computeWireVariableId(name);
	const clash = others.find(variable => computeWireVariableId(variable.name) === wireId);
	return clash ? `"${name}" collides with "${clash.name}" on the board — pick another name.` : null;
};

const createComponent = new CreateComponent();

/** The workflow with the built-in Variables component present (added once, never duplicated). */
const withVariablesComponent = (workflow: IWorkflowRuntime): IWorkflowRuntime =>
	workflow.components.some(isVariablesComponent)
		? workflow
		: { ...workflow, components: [...workflow.components, createComponent.execute(VariablesComponentSchema, VARIABLES_PACKAGE_ID)] };

type VariableInitial = IVariableRuntime["initial"];

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

/** Applies `update` to one action — Start or a component's — wherever it lives. */
const mapAction = (workflow: IWorkflowRuntime, componentId: string, actionId: string, update: (action: IActionRuntime) => IActionRuntime): IWorkflowRuntime => {
	if (workflow.start.id === actionId) return { ...workflow, start: update(workflow.start) };

	const index = workflow.components.findIndex(component => component.id === componentId);
	if (index === -1) return workflow;

	const component = workflow.components[index]!;
	const components = [...workflow.components];
	components[index] = { ...component, actions: component.actions.map(action => action.id === actionId ? update(action) : action) };
	return { ...workflow, components };
};

/** Binds a node's config to a workflow variable. */
export class BindWorkflowActionConfigurationVariable {
	// No connectivity check, unlike an output binding: a variable is global,
	// written by whatever Set ran last — before this action in the flow or in
	// an earlier loop.
	execute(workflow: IWorkflowRuntime, componentId: string, actionId: string, configId: string, variableId: string): IWorkflowRuntime {
		if (!(workflow.variables ?? []).some(variable => variable.id === variableId)) return workflow;
		return mapAction(workflow, componentId, actionId, action => ({
			...action,
			configurations: action.configurations.map(config => config.id === configId ? { ...config, binding: { variableId } } : config),
		}));
	}
}
