import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IActionSchema } from "../../../domain/entities/IAction.schema.js";
import type { IActionRuntime } from "../../../domain/entities/IAction.runtime.js";
import type { IComponentRuntime } from "../../../domain/entities/IComponent.runtime.js";
import { LOGIC_COMPONENT_ID, withLogicComponent } from "../../../domain/value-objects/LogicComponent.js";
import { syncDynamicOutputs } from "./DynamicOutputs.js";
import { AddActionToComponent } from "../component/AddAction.use-case.js";

/**
 * `workflow` ready to take an action of `componentId` — with the built-in
 * Logic component added when that's the one asked for (it's offered before
 * it's in the workflow, see LogicComponent.ts).
 */
export const withComponentFor = (workflow: IWorkflowRuntime, componentId: string): IWorkflowRuntime =>
	componentId === LOGIC_COMPONENT_ID ? withLogicComponent(workflow) : workflow;

/** The component an "add:action" targets — Logic included, before it's in the workflow. */
export const findAddableComponent = (workflow: IWorkflowRuntime, componentId: string): IComponentRuntime | undefined =>
	withComponentFor(workflow, componentId).components.find(c => c.id === componentId);

/** What a component offers to put on the canvas: its triggers, then its actions — each marked. */
export const componentNodes = (schema: Pick<IComponentRuntime["base"], "actions" | "triggers">): { schema: IActionSchema; trigger: boolean }[] => [
	...(schema.triggers ?? []).map(trigger => ({ schema: trigger as IActionSchema, trigger: true })),
	...(schema.actions ?? []).map(action => ({ schema: action as IActionSchema, trigger: false })),
];

/** The schema of `component`'s action or trigger called `name` — what an "add:action" adds. */
export const findNodeSchema = (component: IComponentRuntime, name: string): IActionSchema | undefined =>
	component.base.actions?.find(schema => schema.displayName === name)
	?? component.base.triggers?.find(schema => schema.displayName === name);

/** Adds a node of one of a component's actions (or triggers) to the workflow. */
export class AddActionToWorkflowComponent {
	private addAction = new AddActionToComponent();

	execute(current: IWorkflowRuntime, componentId: string, action: IActionSchema): { workflow: IWorkflowRuntime; action: IActionRuntime | undefined } {
		const workflow = withComponentFor(current, componentId);
		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return { workflow: current, action: undefined };
		const { component, action: added } = this.addAction.execute(workflow.components[componentIdx]!, action);
		// Outputs from its rows (a Switch's rules): one per default row from the start.
		const actionRuntime = added && syncDynamicOutputs(added);
		const components = [...workflow.components];
		components[componentIdx] = actionRuntime && actionRuntime !== added
			? { ...component, actions: component.actions.map(found => found.id === actionRuntime.id ? actionRuntime : found) }
			: component;
		return { workflow: { ...workflow, components }, action: actionRuntime };
	}
}
