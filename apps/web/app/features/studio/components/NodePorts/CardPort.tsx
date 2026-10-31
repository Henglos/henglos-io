import { Handle, Position } from "@xyflow/react";
import { Text } from "@henglosio/ui";
import clsx from "clsx";

// A port as a row inside a compact node's card (ActionNode, StartNode): its
// label, and its handle on the card's edge. The card with handles hanging
// outside it is NodePorts — ActionNodeLegacy / StartNodeLegacy.

type CardPortProps = {
	id: string;
	/** "target": an input, on the left. "source": an output, on the right. */
	type: "target" | "source";
	label: string;
	/** "danger": the Fallback output. */
	tone?: "default" | "danger";
	/** The output the last run ended on — lit up. */
	active?: boolean;
};

export const CardPort: React.FC<CardPortProps> = ({ id, type, label, tone = "default", active = false }) => {
	const isInput = type === "target";
	return (
		<div className={clsx("relative flex items-center h-6 px-3", isInput ? "justify-start" : "justify-end")}>
			<Handle
				id={id}
				type={type}
				position={isInput ? Position.Left : Position.Right}
				className={clsx(
					"border! border-line-subtle! w-2! h-4.5! rounded-xs!",
					tone === "danger" ? "bg-danger!" : active ? "bg-accent!" : "bg-port!",
					active && (tone === "danger" ? "shadow-[0_0_0_3px_var(--danger-subtle)]!" : "shadow-[0_0_0_3px_var(--accent-subtle)]!"),
				)}
			/>
			<Text
				variant="low"
				size="xs"
				className={clsx("truncate", tone === "danger" ? "text-danger!" : active && "text-accent-fg! font-medium")}
			>
				{label}
			</Text>
		</div>
	);
};

/** The ports of a compact card: inputs on the left, outputs on the right — outputs alone (a trigger, Start) take the whole row. */
export const CardPorts: React.FC<{ inputs: React.ReactNode; outputs: React.ReactNode }> = ({ inputs, outputs }) => {
	const none = inputs === null || (Array.isArray(inputs) && inputs.length === 0);
	return (
		<div className={clsx("grid py-1 border-t border-line-subtle", none ? "grid-cols-1" : "grid-cols-2")}>
			{!none && <div className="flex flex-col">{inputs}</div>}
			<div className="flex flex-col">{outputs}</div>
		</div>
	);
};

/**
 * A trigger's card (and Start's — the boot trigger): rounded on the left, where
 * nothing comes in — the flow starts here. Actions keep the plain card.
 */
export const cardShapeClass = (trigger: boolean) => trigger ? "rounded-l-[22px] rounded-r-lg" : "rounded-lg";

/** A trigger's mark in its header: its icon in a round accent tile. */
export const TriggerMark: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<span className="flex items-center justify-center size-6 shrink-0 rounded-full bg-accent-subtle text-accent-fg">{children}</span>
);

/** The "Trigger" tag — next to a trigger's name, in the node and the lists. */
export const TriggerTag: React.FC = () => (
	<span className="shrink-0 px-1.5 h-4 inline-flex items-center rounded-full border border-accent-line bg-accent-subtle text-accent-fg text-[10px] font-medium uppercase tracking-wide">
		Trigger
	</span>
);
