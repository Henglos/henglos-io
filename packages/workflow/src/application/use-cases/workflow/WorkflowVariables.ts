import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { VARIABLE_NAME_PATTERN, variableInitialError, type IVariableRuntime, type IVariableType } from "../../../domain/entities/IVariable.runtime.js";
import type { IShape } from "../../../domain/schemas/ISchema.schema.js";
import { isListShape, isObjectShape } from "../../../domain/value-objects/ShapeValue.js";
import { isVariablesComponent, VARIABLES_PACKAGE_ID, VariablesComponentSchema } from "../../../domain/value-objects/VariablesComponent.js";
import { CreateComponent } from "../component/CreateComponent.use-case.js";
import { generateId } from "../../../utils/identifier.js";
import { protocolLimits } from "../../../domain/value-objects/ProtocolLimits.js";

/** Why `initial` can't be a `type` value in this workflow (its MAX_DATA_BUFFER bounds a string, and a list's / object's JSON). */
export const workflowVariableInitialError = (workflow: Pick<IWorkflowRuntime, "platformSettings">, type: IVariableType, initial: unknown, shape?: IShape) =>
	variableInitialError(type, initial, protocolLimits(workflow).maxData, shape);

/** Whether `shape` is what a `type` variable holds — a list shape for "list", an object one for "object", none otherwise. */
export const shapeFits = (type: IVariableType, shape: IShape | undefined) =>
	type === "list" ? isListShape(shape) : type === "object" ? isObjectShape(shape) : shape === undefined;

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
export const withVariablesComponent = (workflow: IWorkflowRuntime): IWorkflowRuntime =>
	workflow.components.some(isVariablesComponent)
		? workflow
		: { ...workflow, components: [...workflow.components, createComponent.execute(VariablesComponentSchema, VARIABLES_PACKAGE_ID)] };

export type VariableInitial = IVariableRuntime["initial"];
