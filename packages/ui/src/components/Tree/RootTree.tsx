import clsx from "clsx";
import React from "react";
import { TreeContext, TreeItemContext } from "./context";

interface RootTreeProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode;
	value?: string;
	onValueChange?: (value: string) => void;
}

/** The tree — which item is selected. */
export const RootTree: React.FC<RootTreeProps> = ({
	children,
	value,
	onValueChange,
	className,
	...props
}) => {
	return (
		<TreeContext.Provider value={{ value, onValueChange }}>
			<TreeItemContext.Provider value={{ expanded: true, depth: 0 }}>
				<div className={clsx("flex flex-col w-full select-none", className)} {...props}>
					{children}
				</div>
			</TreeItemContext.Provider>
		</TreeContext.Provider>
	);
};
