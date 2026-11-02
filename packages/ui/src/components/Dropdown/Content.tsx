import clsx from "clsx";
import React from "react";
import { DropdownMenu } from "radix-ui";

export interface ContentProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.Content> {
	children: React.ReactNode;
}

/** The menu's panel. */
export const Content: React.FC<ContentProps> = ({ children, className, sideOffset = 4, ...props }) => {
	return (
		<DropdownMenu.Portal>
			<DropdownMenu.Content
				sideOffset={sideOffset}
				className={clsx(
					"z-50 min-w-32 max-w-60 max-h-64 bg-overlay border border-line rounded-lg overflow-y-auto p-2",
					"data-[state=open]:animate-in data-[state=closed]:animate-out",
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
					"data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
					className
				)}
				{...props}
			>
				{children}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	);
};
