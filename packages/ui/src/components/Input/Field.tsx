import React from "react";
import { useInputContext } from "./context";
import { cn } from "../../utils/cn";
import { readNumber, stepMultiplier, stepValue, writeValue } from "./stepping";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/** The text field itself — ↑/↓ step a number when the input has a Handler. */
export const Field: React.FC<FieldProps> = ({ className, onKeyDown, ...props }) => {

	const { hasSegment, scrubbable, inputRef } = useInputContext();

	// ↑/↓ step the value like the scrub handle does (Shift ×10, Alt ×0.1).
	// type="number" already does this natively, so only text fields need it.
	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		onKeyDown?.(e);
		if (e.defaultPrevented || !scrubbable || props.type === "number") return;
		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

		const input = e.currentTarget;
		const current = readNumber(input);
		if (current === undefined) return;

		e.preventDefault();
		writeValue(input, stepValue(input, current, e.key === "ArrowUp" ? 1 : -1, stepMultiplier(e)));
	};

	return (
		<input
			ref={inputRef}
			className={cn(
				"w-full h-full px-2 text-xs leading-4 text-fg placeholder:text-fg-muted outline-none focus-visible:shadow-none",
				hasSegment && "px-2",
				className
			)}
			onKeyDown={handleKeyDown}
			{...props}
		/>
	);

}
