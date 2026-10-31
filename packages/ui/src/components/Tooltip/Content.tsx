import clsx from "clsx";
import React from "react";
import { Tooltip } from "radix-ui";
import { Arrow } from "./Arrow";

interface ContentProps extends React.ComponentPropsWithoutRef<typeof Tooltip.Content> {
	children: React.ReactNode;
	hideArrow?: boolean;
}

/** The tooltip's bubble. */
export const Content: React.FC<ContentProps> = ({
	children,
	className,
	sideOffset = 6,
	hideArrow = false,
	...props
}) => {
	return (
		<Tooltip.Portal>
			<Tooltip.Content
				sideOffset={sideOffset}
				className={clsx(
					"z-50 max-w-64 bg-overlay border border-line rounded-md px-2 py-2",
					"text-xs leading-4 text-fg shadow-lg",
					"data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
					"data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
					"data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95",
					"data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
					"data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
					className
				)}
				{...props}
			>
				{children}
				{!hideArrow && <Arrow />}
			</Tooltip.Content>
		</Tooltip.Portal>
	);
};
