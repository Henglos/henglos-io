import { useEffect } from "react";
import { useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { Text } from "@henglosio/ui";
import { Flag } from "lucide-react";
import clsx from "clsx";
import { CardPort, CardPorts, cardShapeClass, TriggerMark, TriggerTag } from "./NodePorts";
import { defaultCardClass } from "./ActionNode";
import { startAsComponent } from "../lib/configurations";
import { useNodeExtras, useWorkflowCanvas } from "../context";
import type { StartNodeData } from "../types";

// Where every flow begins (and loops back to) — the boot trigger, drawn like
// the other triggers: its name, its ports inside.
export const StartNode = ({ id, data, selected }: NodeProps<Node<StartNodeData>>) => {

	const canvas = useWorkflowCanvas();
	const { action } = data;
	const component = startAsComponent(action);
	const extras = useNodeExtras({ id, component, action, selected: !!selected, start: true });
	const updateNodeInternals = useUpdateNodeInternals();
	const locked = !!canvas.readOnly;

	useEffect(() => {
		updateNodeInternals(id);
	}, [id, action.outputs.length, updateNodeInternals]);

	return (

		<div className={clsx("relative w-64", extras.rootClassName)}>

			{extras.badges}

			<div
				className={clsx(
					"relative flex flex-col bg-raised border w-full transition-[border-color,box-shadow] duration-150",
					cardShapeClass(true),
					extras.cardClassName ?? defaultCardClass(selected),
				)}
			>

				<div className="flex flex-col gap-0.5 pl-4 pr-3 pt-2.5 pb-2">
					<div className="flex items-center gap-2">
						<TriggerMark><Flag size={12} /></TriggerMark>
						<Text variant="high" font="mono" size="sm" className="truncate flex-1">{action.alias}</Text>
						<TriggerTag />
					</div>
					<Text variant="low" size="xs" className="pl-8">On boot</Text>
				</div>

				<CardPorts
					inputs={null}
					outputs={action.outputs.map(output => (
						<CardPort key={output.id} id={output.id} type="source" label={output.base.name} active={extras.activeOutput === output.base.name} locked={locked} />
					))}
				/>

				{extras.footer && <div className="flex gap-1 px-1.5 py-1 border-t border-line-subtle">{extras.footer}</div>}

			</div>

		</div>

	);
};
