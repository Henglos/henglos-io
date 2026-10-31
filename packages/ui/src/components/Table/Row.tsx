import clsx from "clsx";
import React from "react";

interface RowProps extends React.HTMLAttributes<HTMLDivElement> {}

/** One row of the table. */
export const Row: React.FC<RowProps> = ({ children, className, ...props }) => (
	<div
		className={clsx(
			"relative p-4 border-b border-line last:border-b-0 flex items-center gap-6 transition-colors hover:bg-hover",
			className
		)}
		{...props}
	>
		{children}
	</div>
);
