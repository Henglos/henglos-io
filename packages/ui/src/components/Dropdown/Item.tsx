import clsx from "clsx";
import React from "react";
import { DropdownMenu } from "radix-ui";

interface ItemProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> {
	children: React.ReactNode;
}

/** One choice of the menu. */
export const Item: React.FC<ItemProps> = ({ children, className, ...props }) => {
	return (
		<DropdownMenu.Item
			className={clsx(
				"flex items-center gap-2 w-full rounded-sm px-4 py-2 text-sm text-fg cursor-pointer transition-colors",
				"hover:bg-hover data-highlighted:bg-hover",
				className
			)}
			{...props}
		>
			{children}
		</DropdownMenu.Item>
	);
};
