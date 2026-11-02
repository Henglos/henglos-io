import React from "react";
import { cn } from "../../utils/cn";

export interface AffixProps extends React.HTMLAttributes<HTMLSpanElement> {
	children: React.ReactNode;
}

/** Text after the field, inside its box (a unit: "ms", "%"). */
export const Affix: React.FC<AffixProps> = ({ children, className, ...props }) => (

	<div>
		<span
			className={cn(
				"shrink-0 h-full flex items-center p-2 border-l border-line text-xs text-fg-muted whitespace-nowrap",
				className
			)}
			{...props}
		>
			{children}
		</span>

	</div>

);
