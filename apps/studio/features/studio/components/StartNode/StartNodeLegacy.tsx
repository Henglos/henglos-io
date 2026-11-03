import { useEffect } from "react";
import { WorkflowAtom } from "../../store/workflow.store";
import { type StartNodeData } from "../../store/canvas.store";
import { NodeProps, Node, useUpdateNodeInternals } from "@xyflow/react";
import { Play } from "lucide-react";
import { Button, Text } from "@henglosio/ui";
import { useAtomValue } from "jotai";
import type { IConfigurationRuntime } from "@henglosio/workflow";
import { mergeConfigurations } from "../ActionNode/lib/mergeConfigurations";
import { startAsComponent } from "../ActionNode/lib/startAsComponent";
import { ConfigurationField } from "../ActionNode/components/ConfigurationField.component";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import clsx from "clsx";
import { NodePort, NodePorts } from "../NodePorts/NodePorts";
import { DebugBadges, debugCardClass, debugRootClass, useDebugMark } from "../NodePorts/DebugMarks";
import { DebugSessionAtom } from "@/features/studio/store/debug.store";

// The Start as it was before the inspector — its configs inside the card,
// handles hanging outside it. Kept for NODE_LAYOUT "inline" (lib/nodeLayout.ts).
export const StartNodeLegacy = ({ id, data, selected }: NodeProps<Node<StartNodeData>>) => {

	const { action } = data;
	const workflow = useAtomValue(WorkflowAtom);
	const mutate = useWorkflowMutate();
	const updateNodeInternals = useUpdateNodeInternals();
	// Debug mode: the first step, and where Continue comes back when the flow loops.
	const debugMark = useDebugMark(id);
	const debug = useAtomValue(DebugSessionAtom);
	const ranOutput = debug?.state.ran?.actionId === id ? debug.state.ran.output.name : null;

	const board = workflow?.data.board;
	const component = startAsComponent(action);
	const configurations = mergeConfigurations(action.base.configurations, action.configurations);

	const onChangeValue = (configurationId: string, value: IConfigurationRuntime["value"]) => {
		mutate({
			op: "update:configuration",
			componentId: component.id,
			actionId: action.id,
			configurationId,
			value,
		});
	};

	useEffect(() => {
		updateNodeInternals(id);
	}, [id]);

	return (

		// Same shape as ActionNode: the box is the card, the handles hang outside it (NodePorts).
		<div className={clsx("relative w-68", debugRootClass(debugMark))}>

			<DebugBadges mark={debugMark} />

			<div
				className={clsx(
					"relative flex flex-col z-10 bg-raised border rounded-lg overflow-hidden w-full transition-[border-color,box-shadow] duration-150",
					debugCardClass(debugMark, selected),
				)}
			>

				<div className="flex gap-2 items-center h-fit px-2 py-2">

					<Text variant="high" font="mono" size="lg">{action.alias}</Text>
					<Text variant="low" size="sm">•</Text>
					<Text variant="low" size="sm">Core</Text>

				</div>

				{board && configurations.length > 0 && (
					<div className="flex flex-col gap-4 px-4 py-2 border-b border-line-subtle">
						{configurations.map(configuration => (
							<ConfigurationField
								key={configuration.id}
								configuration={configuration}
								component={component}
								board={board}
								actionId={action.id}
								connections={workflow?.data.connections ?? []}
								onChange={value => onChangeValue(configuration.id, value)}
							/>
						))}
					</div>
				)}

				<div className="flex gap-2 px-2 py-2">

					<Button.Root size="sm" variant="ghost">
						<Button.Icon>
							<Play size={12}/>
						</Button.Icon>
					</Button.Root>

				</div>

			</div>

			<NodePorts side="right">
				{action.outputs.map(output => (
					<NodePort key={output.id} id={output.id} type="source" label={output.base.name} active={ranOutput === output.base.name} />
				))}
			</NodePorts>

		</div>

	);
};
