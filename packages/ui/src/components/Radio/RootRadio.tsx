import clsx from "clsx";
import React from "react";
import { Text } from "../Text";

export interface RootRadioProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	label?: string;
	disabled?: boolean;
}

/** A radio button, with its label. */
export const RootRadio: React.FC<RootRadioProps> = ({
	checked = false,
	onCheckedChange,
	label,
	disabled,
	className,
	onClick,
	...props
}) => (
	<label className={clsx("inline-flex items-center gap-2 cursor-pointer select-none", disabled && "opacity-40 cursor-not-allowed", className)}>
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			disabled={disabled}
			onClick={(e) => { onCheckedChange?.(!checked); onClick?.(e); }}
			className={clsx(
				"size-4 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer",
				checked
					? "p-px"
					: "bg-field"
			)}
			{...props}
		>
			{checked && <span className="size-2 rounded-full bg-accent" />}
		</button>
		{label && (
			<Text size="lg" variant={checked ? "high" : "low"} className="leading-4">
				{label}
			</Text>
		)}
	</label>
);
