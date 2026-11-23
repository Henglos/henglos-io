import React from "react";
import { DropdownMenu } from "radix-ui";
import { cn } from "../../utils/cn";

export interface TriggerProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Trigger> {
	children?: React.ReactNode;
}

/**
 * What opens the menu. On its own, a bare button (no border, background or
 * padding). With `asChild`, the element given is the trigger as it is — it
 * styles itself (a Button, a field-like box): nothing is reset on it.
 */
export const Trigger: React.FC<TriggerProps> = ({ children, className, asChild, ...props }) => {
	return (
		<DropdownMenu.Trigger
			asChild={asChild}
			className={asChild ? className : cn("outline-none border-none bg-transparent p-0 cursor-pointer", className)}
			{...props}
		>
			{children}
		</DropdownMenu.Trigger>
	);
};
