import clsx from "clsx";
import React from "react";

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
	children: React.ReactNode;
}

/** An item's icon. */
export const Icon: React.FC<IconProps> = ({ children, className, ...props }) => (
	<span className={clsx("flex items-center justify-center shrink-0", className)} {...props}>
		{children}
	</span>
);
