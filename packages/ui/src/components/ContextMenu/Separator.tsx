import clsx from "clsx";
import React from "react";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

/** A line between groups of choices. */
export const Separator: React.FC<SeparatorProps> = ({ className, ...props }) => {
	return (
		<div
			className={clsx("h-px bg-line my-2", className)}
			{...props}
		/>
	);
};
