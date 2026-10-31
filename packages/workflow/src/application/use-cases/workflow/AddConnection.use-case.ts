import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConnectionRuntime } from "../../../domain/entities/IConnection.runtime.js";
import { CreateConnection } from "../connection/CreateConnection.use-case.js";
import { isEntryAction } from "./WorkflowEntries.js";

function actionExists(workflow: IWorkflowRuntime, actionId: string): boolean {
	return (
		workflow.start.id === actionId ||
		workflow.board.actions.some(a => a.id === actionId) ||
		workflow.components.some(c => c.actions.some(a => a.id === actionId))
	);
}

/**
 * Wires two nodes. Refuses (connection null) when either is missing, the target is Start or a
 * trigger (they begin a branch — nothing leads into them), or the same wire is already there.
 */
export class AddConnectionToWorkflow {
	private createConnection = new CreateConnection();

	execute(
		workflow: IWorkflowRuntime,
		sourceActionId: string,
		targetActionId: string,
		sourceHandle: string,
		targetHandle: string,
	): { workflow: IWorkflowRuntime; connection: IConnectionRuntime | null } {
		const sourceExists = actionExists(workflow, sourceActionId);
		const targetExists = actionExists(workflow, targetActionId);
		if (!sourceExists || !targetExists) return { workflow, connection: null };

		// Start and the triggers begin a branch: nothing leads into them.
		if (isEntryAction(workflow, targetActionId)) return { workflow, connection: null };

		const alreadyConnected = workflow.connections.some(
			c =>
				c.source === sourceActionId &&
				c.target === targetActionId &&
				c.sourceHandle === sourceHandle &&
				c.targetHandle === targetHandle,
		);
		if (alreadyConnected) return { workflow, connection: null };

		const connection = this.createConnection.execute(sourceActionId, targetActionId, sourceHandle, targetHandle);
		return { workflow: { ...workflow, connections: [...workflow.connections, connection] }, connection };
	}
}
