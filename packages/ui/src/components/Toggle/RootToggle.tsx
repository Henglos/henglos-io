import clsx from "clsx";
import React, { useState } from "react";
import { Slot } from "radix-ui";
import { Label } from "./Label";
import { ToggleContext } from "./context";
import type { ToggleSize, ToggleVariant } from "./context";

const variantUnpressedStyles: Record<ToggleVariant, string> = {
	ghost:   "bg-transparent text-fg-muted hover:text-fg",
	surface: "bg-raised text-fg-muted hover:bg-overlay",
};

const variantPressedStyles: Record<ToggleVariant, string> = {
	ghost:   "bg-active text-fg hover:opacity-90",
	surface: "bg-active text-fg hover:opacity-90",
};

// Matches Button's size scale (sm=22px/md=28px/lg=34px) so any button-like
// control in the system reads as the same size for the same label.
const sizeStyles: Record<ToggleSize, string> = {
	sm: "h-6 px-2 gap-2",
	md: "h-8 px-4 gap-2",
	lg: "h-10 px-6 gap-2",
};

const sizeIconOnlyStyles: Record<ToggleSize, string> = {
	sm: "size-6",
	md: "size-8",
	lg: "size-10",
};

interface RootToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: React.ReactNode;
	pressed?: boolean;
	defaultPressed?: boolean;
	onPressedChange?: (pressed: boolean) => void;
	variant?: ToggleVariant;
	size?: ToggleSize;
	asChild?: boolean;
}

/** The toggle itself — pressed or not. */
export const RootToggle: React.FC<RootToggleProps> = ({
	children,
	pressed: controlledPressed,
	defaultPressed = false,
	onPressedChange,
	variant = "ghost",
	size = "sm",
	disabled,
	className,
	onClick,
	asChild = false,
	...props
}) => {

	const Comp = (asChild ? Slot.Root : "button") as React.ElementType;

	const [internalPressed, setInternalPressed] = useState(defaultPressed);

	const isControlled = controlledPressed !== undefined;
	const pressed = isControlled ? controlledPressed : internalPressed;

	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		const next = !pressed;
		if (!isControlled) setInternalPressed(next);
		onPressedChange?.(next);
		onClick?.(e);
	};

	const hasLabel = React.Children.toArray(children).some(
		child => React.isValidElement(child) && child.type === Label
	);

	return (
		<ToggleContext.Provider value={{ pressed, variant, size }}>
			<Comp
				type="button"
				aria-pressed={pressed}
				data-pressed={pressed}
				disabled={disabled}
				onClick={handleClick}
				className={clsx(
					"flex items-center justify-center rounded-md cursor-pointer transition-colors whitespace-nowrap",
					pressed ? variantPressedStyles[variant] : variantUnpressedStyles[variant],
					hasLabel ? sizeStyles[size] : sizeIconOnlyStyles[size],
					disabled && "opacity-40 cursor-not-allowed pointer-events-none",
					className
				)}
				{...props}
			>
				{children}
			</Comp>
		</ToggleContext.Provider>
	);

};
