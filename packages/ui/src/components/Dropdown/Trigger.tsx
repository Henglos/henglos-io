import React from "react";
import { DropdownMenu } from "radix-ui";

interface TriggerProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Trigger> {
	children?: React.ReactNode;
}

/** What opens the menu (wraps a button). */
export const Trigger: React.FC<TriggerProps> = ({ children, className, ...props }) => {
	return (
		<DropdownMenu.Trigger
			className={`outline-none border-none bg-transparent p-0 cursor-pointer ${className ?? ""}`}
			{...props}
		>
			{children}
		</DropdownMenu.Trigger>
	);
};
