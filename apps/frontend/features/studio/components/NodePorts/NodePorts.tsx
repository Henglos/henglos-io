import { Handle, Position } from "@xyflow/react";
import clsx from "clsx";

// The handles of every canvas node (ActionNode, StartNode) — one look for all.
//
// The column hangs outside the node's card (absolute + translate), so the
// node's box is just the card and the space around it stays pane: dragging
// there pans the viewport. pointer-events-none on the column lets those drags
// pass through the labels; only the handles themselves take the pointer.

type NodePortsProps = {
	side: "left" | "right";
	children: React.ReactNode;
	ref?: React.Ref<HTMLDivElement>;
};

export const NodePorts: React.FC<NodePortsProps> = ({ side, children, ref }) => (
	<div
		ref={ref}
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
	/** The output the action last ended on (▶) — lit up. */
	active?: boolean;
	className?: string;
};

export const NodePort: React.FC<NodePortProps> = ({ id, type, label, tone = "default", active = false, className }) => {

	const isInput = type === "target";

	const handle = (
		<Handle
			id={id}
			type={type}
			position={isInput ? Position.Left : Position.Right}
			style={{ position: "unset" }}
			className={clsx(
				"pointer-events-auto! transform-none! rounded-none! border! border-line-subtle! w-2! h-5.5!",
				isInput ? "rounded-xs!" : "rounded-xs!",
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
