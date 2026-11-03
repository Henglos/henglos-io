import type { IActionRuntime, IComponentRuntime } from "@henglosio/workflow";
import { START_NODE_ID } from "../../../store/canvas.store";

export const startAsComponent = (start: IActionRuntime): IComponentRuntime => ({
	id: START_NODE_ID,
	packageId: "core",
	alias: start.base.displayName,
	base: { displayName: start.base.displayName, description: start.base.description },
	actions: [start],
});
