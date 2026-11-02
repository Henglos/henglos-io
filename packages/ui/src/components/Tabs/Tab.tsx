import { cn } from "../../utils/cn";
import React from "react";
import { useTabsContext } from "./context";

export interface TabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	value: string;
	children: React.ReactNode;
}

/** One tab — selects its panel. */
export const Tab: React.FC<TabProps> = ({ value, children, className, ...props }) => {
	const { value: current, onValueChange } = useTabsContext();
	const active = current === value;

	return (
		<button
			role="tab"
			type="button"
			aria-selected={active}
			onClick={() => onValueChange(value)}
			style={active ? { borderBottom: "1px solid var(--accent)", marginBottom: "-1px" } : undefined}
			className={cn(
				"text-xs leading-4 pb-4 transition-colors cursor-pointer whitespace-nowrap",
				active ? "font-medium text-fg" : "text-fg-muted hover:text-fg",
				className
			)}
			{...props}
		>
			{children}
		</button>
	);
};
