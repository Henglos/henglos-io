import clsx from "clsx";
import React, { useState } from "react";
import { TabsContext } from "./context";

export interface RootTabsProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
}

/** The tabs — which one is selected. */
export const RootTabs: React.FC<RootTabsProps> = ({
	children,
	value: controlled,
	defaultValue = "",
	onValueChange,
	className,
	...props
}) => {
	const [internal, setInternal] = useState(defaultValue);
	const isControlled = controlled !== undefined;
	const value = isControlled ? controlled : internal;

	const handleValueChange = (next: string) => {
		if (!isControlled) setInternal(next);
		onValueChange?.(next);
	};

	return (
		<TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
			<div className={clsx("flex flex-col", className)} {...props}>
				{children}
			</div>
		</TabsContext.Provider>
	);
};
