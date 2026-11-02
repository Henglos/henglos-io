import clsx from "clsx";
import React from "react";
import { DropdownMenu } from "radix-ui";

export interface LabelProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Label> {
	children: React.ReactNode;
}

/** A heading among the menu's choices. */
export const Label: React.FC<LabelProps> = ({ children, className, ...props }) => {
	return (
		<DropdownMenu.Label
			className={clsx("text-sm text-fg whitespace-nowrap", className)}
			{...props}
		>
			{children}
		</DropdownMenu.Label>
	);
};
