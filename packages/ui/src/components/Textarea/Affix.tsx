import React from "react";
import { cn } from "../../utils/cn";

interface AffixProps extends React.HTMLAttributes<HTMLSpanElement> {
	children: React.ReactNode;
}

/** Text after the field, inside its box. */
export const Affix: React.FC<AffixProps> = ({ children, className, ...props }) => (
	<div>
		<span
			className={cn(
				"shrink-0 h-full flex items-start p-2 border-l border-line text-xs text-fg-muted whitespace-nowrap",
				className
			)}
			{...props}
		>
			{children}
		</span>
	</div>
);
