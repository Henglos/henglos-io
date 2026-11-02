import clsx from "clsx";
import { Select as SelectPrimitive } from "radix-ui";
import React from "react";

export interface ContentProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> {
	children: React.ReactNode;
}

/** The list's panel. */
export const Content: React.FC<ContentProps> = ({ children, className, ...props }) => {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				position="popper"
				sideOffset={4}
				className={clsx(
					"z-50 min-w-(--radix-select-trigger-width)",
					"bg-overlay border border-line rounded-lg overflow-y-auto p-2",
					"max-h-64",
					className
				)}
				{...props}
			>
				<SelectPrimitive.Viewport>
					{children}
				</SelectPrimitive.Viewport>
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
};
