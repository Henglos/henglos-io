import clsx from "clsx";
import React from "react";
import { Tooltip } from "radix-ui";

export interface TriggerProps extends React.ComponentPropsWithoutRef<typeof Tooltip.Trigger> {
	children?: React.ReactNode;
}

/** What hovering (or focusing) opens the tooltip on. */
export const Trigger: React.FC<TriggerProps> = ({ children, className, asChild, ...props }) => {
	return (
		<Tooltip.Trigger
			asChild={asChild}
			// The button reset is for the default <button>; with asChild the child keeps its own styles.
			className={asChild ? className : clsx("outline-none border-none bg-transparent p-0 cursor-pointer", className)}
			{...props}
		>
			{children}
		</Tooltip.Trigger>
	);
};
