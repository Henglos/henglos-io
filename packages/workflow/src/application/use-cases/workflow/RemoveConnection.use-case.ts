import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConnectionRuntime } from "../../../domain/entities/IConnection.runtime.js";

/** Removes a wire. */
export class RemoveConnectionFromWorkflow {
	execute(workflow: IWorkflowRuntime, connectionId: string): { workflow: IWorkflowRuntime; connection: IConnectionRuntime | undefined } {
		const connection = workflow.connections.find(c => c.id === connectionId);
		return {
			workflow: { ...workflow, connections: workflow.connections.filter(c => c.id !== connectionId) },
			connection,
		};
	}
}
