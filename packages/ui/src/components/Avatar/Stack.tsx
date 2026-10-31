import clsx from "clsx";
import React from "react";

interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	max?: number;
}

/** Avatars overlapping in a row — past `max`, a "+N" for the rest. */
export const Stack: React.FC<StackProps> = ({ children, max, className, ...props }) => {
	const items = React.Children.toArray(children);
	const visible = max ? items.slice(0, max) : items;
	const overflow = max ? Math.max(0, items.length - max) : 0;

	return (
		<div className={clsx("flex -space-x-2", className)} {...props}>
			{visible.map((child, i) =>
				React.cloneElement(child as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
					key: i,
				})
			)}
			{overflow > 0 && (
				<div
					className="size-8 rounded-full flex justify-center items-center text-xs text-fg-muted shrink-0 border-2 border-line-subtle"
				>
					+{overflow}
				</div>
			)}
		</div>
	);
};
