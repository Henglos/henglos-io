import { cn } from "../../utils/cn";
import React from "react";
import { useTabsContext } from "./context";

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
	value: string;
	children: React.ReactNode;
}

/** A tab's content — shown while it's selected. */
export const TabPanel: React.FC<TabPanelProps> = ({ value, children, className, ...props }) => {
	const { value: current } = useTabsContext();
	if (current !== value) return null;

	return (
		<div role="tabpanel" className={cn("pt-4", className)} {...props}>
			{children}
		</div>
	);
};
