import clsx from "clsx";
import { Select as SelectPrimitive } from "radix-ui";
import React from "react";

interface RootSelectProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	value?: string;
	onValueChange?: (value: string) => void;
}

/** The select — its value, and whether it's open. */
export const RootSelect: React.FC<RootSelectProps> = ({
	children,
	value,
	onValueChange,
	className,
	...props
}) => {
	return (
		<SelectPrimitive.Root value={value} onValueChange={onValueChange}>
			<div className={clsx("relative inline-block", className)} {...props}>
				{children}
			</div>
		</SelectPrimitive.Root>
	);
};
