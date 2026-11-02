import clsx from "clsx";
import React, { useState } from "react";

export interface RootSwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
	checked?: boolean;
	defaultChecked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
}

/** An on/off switch. */
export const RootSwitch: React.FC<RootSwitchProps> = ({
	checked: controlled,
	defaultChecked = false,
	onCheckedChange,
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
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={handleClick}
			className={clsx(
				"flex items-center rounded-full w-10 h-6 p-0.5 border transition-colors cursor-pointer",
				checked
					? "bg-accent border-accent"
					: "bg-field border-line",
				disabled && "opacity-40 cursor-not-allowed pointer-events-none",
				className
			)}
			{...props}
		>
			<span
				className={clsx(
					"size-4 rounded-full transition-all duration-200",
					checked
						? "ml-auto bg-fg"
						: "bg-fg-muted"
				)}
			/>
		</button>
	);
};
