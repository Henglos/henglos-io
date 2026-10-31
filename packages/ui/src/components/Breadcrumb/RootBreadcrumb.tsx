import clsx from "clsx";
import React from "react";

interface RootBreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
	children: React.ReactNode;
}

/** The path's row. */
export const RootBreadcrumb: React.FC<RootBreadcrumbProps> = ({
	children,
	className,
	...props
}) => (
	<nav
		className={clsx("flex items-center h-4 gap-2", className)}
		aria-label="breadcrumb"
		{...props}
	>
		{children}
	</nav>
);
