import clsx from "clsx";
import React from "react";
import { Slot } from "radix-ui";
import { ButtonContext } from "./context";
import type { ButtonVariant, ButtonSize } from "./context";
import { Label } from "./Label";

const sizeStyles: Record<ButtonSize, { height: string; square: string; px: string }> = {
	sm: { height: "h-6", square: "size-6!", px: "px-2" },
	md: { height: "h-8", square: "size-8!", px: "px-4" },
	lg: { height: "h-10", square: "size-10!", px: "px-6" },
};

const variantStyles: Record<ButtonVariant, string> = {
	cursor: "text-fg-muted hover:text-fg cursor-pointer",
	ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-hover",
	surface: "bg-raised border border-line text-fg hover:bg-overlay",
	primary: "bg-accent text-on-accent hover:bg-accent-hover font-semibold",
	destructive: "bg-danger-subtle border border-danger-line text-danger hover:bg-danger/20",
	accent: "bg-accent text-on-accent hover:bg-accent-hover",
};


interface RootButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: React.ReactNode;
	variant?: ButtonVariant;
	size?: ButtonSize;
	asChild?: boolean;
}

/** The button itself — its variant and size reach its Icon and Label. */
export const RootButton: React.FC<RootButtonProps> = ({
	children,
	variant = "surface",
	size = "sm",
	disabled,
	className,
	asChild = false,
	...props
}) => {

	const Comp = (asChild ? Slot.Root : "button") as React.ElementType;

	const hasLabel = React.Children.toArray(children).some(
		child => React.isValidElement(child) && child.type === Label
	);

	return (
		<ButtonContext.Provider value={{ variant, size }}>
			<Comp
				disabled={disabled}
				className={clsx(
					"flex shrink-0 items-center justify-center rounded-md cursor-pointer transition-colors whitespace-nowrap",
					sizeStyles[size].height,
					hasLabel ? [sizeStyles[size].px, "gap-2", "w-fit"] : sizeStyles[size].square,
					variantStyles[variant],
					disabled && "opacity-40 cursor-not-allowed pointer-events-none",
					className
				)}
				{...props}
			>
				{children}
			</Comp>
		</ButtonContext.Provider>
	);

}
