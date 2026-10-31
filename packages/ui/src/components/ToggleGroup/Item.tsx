import React from "react";
import { Slot } from "radix-ui";
import { useToggleGroupContext } from "./context";
import { cn } from "../../utils/cn";

interface ToggleGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	value: string;
	children: React.ReactNode;
	asChild?: boolean;
}

const sizeStyles: Record<"sm" | "md" | "lg", string> = {
	sm: "h-6 px-2 gap-2",
	md: "h-8 px-2 gap-2",
	lg: "h-10 px-4 gap-2",
};

/** One toggle of the group. */
export const Item: React.FC<ToggleGroupItemProps> = ({
	value,
	children,
	className,
	asChild = false,
	...props
}) => {
	const { value: current, onValueChange, size } = useToggleGroupContext();
	const active = current === value;

	const Comp = (asChild ? Slot.Root : "button") as React.ElementType;

	return (
		<Comp
			type="button"
			role="radio"
			aria-checked={active}
			onClick={() => onValueChange(value)}
			className={cn(
				"flex items-center w-fit shrink-0 overflow-hidden transition-colors cursor-pointer",
				"text-xs leading-4 text-fg-muted",
				"not-last:border-r not-last:border-line",
				active
					? "bg-active"
					: "hover:bg-hover",
				sizeStyles[size],
				className
			)}
			{...props}
		>
			{children}
		</Comp>
	);
};
