import { Handle, Position } from "@xyflow/react";
import clsx from "clsx";

// The handles of every canvas node (ActionNode, StartNode) — one look for all.
//
// The column hangs outside the node's card (absolute + translate), so the
// node's box is just the card and the space around it stays pane: dragging
// there pans the viewport. pointer-events-none on the column lets those drags
// pass through the labels; only the handles themselves take the pointer.

export const NodePorts: React.FC<{ side: "left" | "right"; children: React.ReactNode }> = ({ side, children }) => (
	<div
		className={clsx(
			"absolute top-0 py-8 flex flex-col gap-2 pointer-events-none",
			side === "left" ? "left-0 -translate-x-full items-end" : "right-0 translate-x-full items-start",
		)}
	>
		{children}
	</div>
);

type NodePortProps = {
	id: string;
	/** "target": an input, on the left. "source": an output, on the right. */
	type: "target" | "source";
	label: string;
	/** "danger": the Fallback output. */
	tone?: "default" | "danger";
	/** The output the action last ended on — lit up. */
	active?: boolean;
	/** A read-only canvas: the handle can't start a wire. */
	locked?: boolean;
	className?: string;
};

/** One port of a node: its handle on the node's edge, and its label beside it. */
export const NodePort: React.FC<NodePortProps> = ({ id, type, label, tone = "default", active = false, locked = false, className }) => {

	const isInput = type === "target";

	const handle = (
		<Handle
			id={id}
			type={type}
			position={isInput ? Position.Left : Position.Right}
			isConnectable={!locked}
			style={{ position: "unset" }}
			className={clsx(
				"transform-none! rounded-none! border! border-line-subtle! w-2! h-5.5!",
				locked ? "pointer-events-none!" : "pointer-events-auto!",
				isInput ? "rounded-l-xs!" : "rounded-r-xs!",
				tone === "danger" ? "bg-danger!" : active ? "bg-accent!" : "bg-port!",
				active && (tone === "danger" ? "shadow-[0_0_0_3px_var(--danger-subtle)]!" : "shadow-[0_0_0_3px_var(--accent-subtle)]!"),
			)}
		/>
	);

	const text = (
		<span className={clsx(
			"bg-canvas px-2 rounded-sm text-sm whitespace-nowrap",
			tone === "danger" ? "text-danger" : active ? "text-accent-fg" : "text-fg-muted",
			active && "font-medium",
		)}>
			{label}
		</span>
	);

	return (
		<div className={clsx("flex gap-2 items-center h-fit", className)}>
			{isInput ? <>{text}{handle}</> : <>{handle}{text}</>}
		</div>
	);

};

// A port as a row inside a compact node's card (ActionNode, StartNode): its
// label, and its handle on the card's edge.
export const CardPort: React.FC<Omit<NodePortProps, "className">> = ({ id, type, label, tone = "default", active = false, locked = false }) => {

	const isInput = type === "target";

	return (
		<div className={clsx("relative flex items-center h-6 px-3", isInput ? "justify-start" : "justify-end")}>
			<Handle
				id={id}
				type={type}
				position={isInput ? Position.Left : Position.Right}
				isConnectable={!locked}
				className={clsx(
					"border! border-line-subtle! w-2! h-4.5! rounded-xs!",
					locked && "pointer-events-none!",
					tone === "danger" ? "bg-danger!" : active ? "bg-accent!" : "bg-port!",
					active && (tone === "danger" ? "shadow-[0_0_0_3px_var(--danger-subtle)]!" : "shadow-[0_0_0_3px_var(--accent-subtle)]!"),
				)}
			/>
			<span className={clsx(
				"truncate text-xs",
				tone === "danger" ? "text-danger" : active ? "text-accent-fg font-medium" : "text-fg-muted",
			)}>
				{label}
			</span>
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

/** A trigger's card (and Start's): rounded on the left, where nothing comes in — the flow starts here. */
export const cardShapeClass = (trigger: boolean) => trigger ? "rounded-l-[22px] rounded-r-lg" : "rounded-lg";

/** A trigger's icon in a round accent tile. */
export const TriggerMark: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<span className="flex items-center justify-center size-6 shrink-0 rounded-full bg-accent-subtle text-accent-fg">{children}</span>
);

/** The "Trigger" tag next to a trigger's name. */
export const TriggerTag: React.FC = () => (
	<span className="shrink-0 px-1.5 h-4 inline-flex items-center rounded-full border border-accent-line bg-accent-subtle text-accent-fg text-[10px] font-medium uppercase tracking-wide">
		Trigger
	</span>
);
