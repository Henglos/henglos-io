import clsx from "clsx";
import { Check } from "lucide-react";
import React, { useState } from "react";
import { Text } from "../Text";

interface RootCheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
	checked?: boolean;
	defaultChecked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	label?: string;
}

/** A checkbox, with its label. */
export const RootCheckbox: React.FC<RootCheckboxProps> = ({
	checked: controlled,
	defaultChecked = false,
	onCheckedChange,
	label,
	disabled,
	className,
	onClick,
	...props
}) => {
	const [internal, setInternal] = useState(defaultChecked);
	const isControlled = controlled !== undefined;
	const checked = isControlled ? controlled : internal;

	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		const next = !checked;
		if (!isControlled) setInternal(next);
		onCheckedChange?.(next);
		onClick?.(e);
	};

	return (
		<label className={clsx("inline-flex items-center gap-2 cursor-pointer select-none", disabled && "opacity-40 cursor-not-allowed", className)}>
			<button
				type="button"
				role="checkbox"
				aria-checked={checked}
				disabled={disabled}
				onClick={handleClick}
				className={clsx(
					"size-4 rounded flex items-center justify-center transition-colors shrink-0 cursor-pointer",
					checked
						? "bg-accent"
						: "bg-field"
				)}
				{...props}
			>
				{checked && <Check size={12} className="text-fg" />}
			</button>
			{label && (
				<Text size="lg" variant={checked ? "high" : "low"} className="leading-4">
					{label}
				</Text>
			)}
		</label>
	);
};
