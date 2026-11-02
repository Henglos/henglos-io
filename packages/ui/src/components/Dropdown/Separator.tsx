import clsx from "clsx";
import React from "react";
import { DropdownMenu } from "radix-ui";

export interface SeparatorProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Separator> {}

/** A line between groups of choices. */
export const Separator: React.FC<SeparatorProps> = ({ className, ...props }) => {
	return (
		<DropdownMenu.Separator
			className={clsx("h-px bg-line my-2", className)}
			{...props}
		/>
	);
};
