import type { IConnectionRuntime } from "@henglosio/workflow";

/**
 * A configuration can only bind to the output of an action that runs strictly
 * before it in the flow. This rules out:
 *  - binding an action's own output into its own configuration;
 *  - binding the output of an action reachable *downstream* from the target
 *    (i.e. a node "ahead" in the flow) into a node "behind" it — that output
 *    wouldn't exist yet when the target action runs.
 *
 * Connections are directed edges `source -> target`, so an action is
 * downstream of `targetActionId` if it can be reached by walking forward
 * from it.
 */
export const isOutputBindAllowed = (
	targetActionId: string,
	sourceActionId: string,
	connections: IConnectionRuntime[],
): boolean => {

	if (targetActionId === sourceActionId) return false;

	const visited = new Set<string>([targetActionId]);
	const stack = [targetActionId];

	while (stack.length > 0) {

		const current = stack.pop() as string;

		for (const connection of connections) {

			if (connection.source !== current) continue;
			if (connection.target === sourceActionId) return false;

			if (!visited.has(connection.target)) {
				visited.add(connection.target);
				stack.push(connection.target);
			}

		}

	}

	return true;

};
