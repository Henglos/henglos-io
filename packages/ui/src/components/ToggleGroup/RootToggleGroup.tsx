import React, { useState } from "react";
import { ToggleGroupContext } from "./context";
import { cn } from "../../utils/cn";

// Matches Button/Toggle's size scale (sm=22px/md=28px/lg=34px) so any
// button-like control in the system reads as the same size for the same label.
const heightStyles: Record<"sm" | "md" | "lg", string> = {
	sm: "h-6",
	md: "h-8",
	lg: "h-10",
};

export interface RootToggleGroupProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	size?: "sm" | "md" | "lg";
}

/** The group — which items are picked. */
export const RootToggleGroup: React.FC<RootToggleGroupProps> = ({
	children,
	value: controlled,
	defaultValue = "",
	onValueChange,
	size = "md",
	className,
	...props
}) => {
	const [internal, setInternal] = useState(defaultValue);
	const isControlled = controlled !== undefined;
	const value = isControlled ? controlled : internal;

	const handleValueChange = (next: string) => {
		if (!isControlled) setInternal(next);
		onValueChange?.(next);
	};

	return (
		<ToggleGroupContext.Provider value={{ value, onValueChange: handleValueChange, size }}>
			<div
				role="group"
				className={cn(
					"shrink-0 inline-flex items-center w-fit bg-field border border-line rounded-md overflow-hidden",
					heightStyles[size],
					className
				)}
				{...props}
			>
				{children}
			</div>
		</ToggleGroupContext.Provider>
	);
};
