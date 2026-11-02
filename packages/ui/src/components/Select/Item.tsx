import clsx from "clsx";
import { Select as SelectPrimitive } from "radix-ui";
import React from "react";

export interface ItemProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
	children: React.ReactNode;
	value: string;
}

/** One choice of the list. */
export const Item: React.FC<ItemProps> = ({ children, value, className, ...props }) => {
	return (
		<SelectPrimitive.Item
			value={value}
			className={clsx(
				"flex items-center w-full rounded-sm px-4 py-2 text-sm text-fg",
				"cursor-pointer transition-colors outline-none",
				"hover:bg-hover data-highlighted:bg-hover",
				className
			)}
			{...props}
		>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
};
