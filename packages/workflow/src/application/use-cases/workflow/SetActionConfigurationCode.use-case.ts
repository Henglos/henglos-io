import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import { SetComponentActionConfigurationCode } from "../component/SetActionConfigurationCode.use-case.js";
import { SetActionConfigurationCode } from "../actions/SetActionConfigurationCode.js";

// Unlike BindWorkflowActionConfigurationOutput, there's no connectivity check
// against workflow.connections here — a Code binding has no sourceActionId at
// all (see CodeBindingSchema), so there's no upstream node to require a wire
// to. The script itself can read *any* previously executed action's
// published output in the run via ctx.get(name) (HIOSDK::Context is populated
// across the whole run, not just from directly-wired predecessors — see
// Execute::execute's m_context.merge), so gating on graph adjacency the way a
// BIND does would only get in the way here, not prevent anything invalid.
export class SetWorkflowActionConfigurationCode {
	private setComponentAction = new SetComponentActionConfigurationCode();
	private setStartAction = new SetActionConfigurationCode();

	execute(
		workflow: IWorkflowRuntime,
		componentId: string,
		actionId: string,
		configId: string,
		code: string,
	): IWorkflowRuntime {
		if (workflow.start.id === actionId) {
			return { ...workflow, start: this.setStartAction.execute(workflow.start, configId, code) };
		}

		const componentIdx = workflow.components.findIndex(c => c.id === componentId);
		if (componentIdx === -1) return workflow;
		const components = [...workflow.components];
		components[componentIdx] = this.setComponentAction.execute(components[componentIdx]!, actionId, configId, code);
		return { ...workflow, components };
	}
}
