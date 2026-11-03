import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { NodeProps, Node, useUpdateNodeInternals } from "@xyflow/react";
import { Text } from "@henglosio/ui";
import { Flag } from "lucide-react";
import clsx from "clsx";
import { type StartNodeData } from "../../store/canvas.store";
import { DebugSessionAtom } from "@/features/studio/store/debug.store";
import { DebugBadges, debugCardClass, debugRootClass, useDebugMark } from "../NodePorts/DebugMarks";
import { CardPort, CardPorts, cardShapeClass, TriggerMark, TriggerTag } from "../NodePorts/CardPort";

// Where every flow begins (and loops back to) — the boot trigger, drawn like
// the other triggers (cardShapeClass): its name, its ports inside. Its configs
// (Mode) are edited in the inspector. With them inside the card: StartNodeLegacy.
export const StartNode = ({ id, data, selected }: NodeProps<Node<StartNodeData>>) => {

	const { action } = data;
	const updateNodeInternals = useUpdateNodeInternals();
	// Debug mode: the first step, and where Continue comes back when the flow loops.
	const debugMark = useDebugMark(id);
	const debug = useAtomValue(DebugSessionAtom);
	const ranOutput = debug?.state.ran?.actionId === id ? debug.state.ran.output.name : null;

	useEffect(() => {
		updateNodeInternals(id);
	}, [id, action.outputs.length, updateNodeInternals]);

	return (

		<div className={clsx("relative w-64", debugRootClass(debugMark))}>

			<DebugBadges mark={debugMark} />

			<div
				className={clsx(
					"relative flex flex-col bg-raised border w-full transition-[border-color,box-shadow] duration-150",
					cardShapeClass(true),
					debugCardClass(debugMark, selected),
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
						<CardPort key={output.id} id={output.id} type="source" label={output.base.name} active={ranOutput === output.base.name} />
					))}
				/>

			</div>

		</div>

	);
};
