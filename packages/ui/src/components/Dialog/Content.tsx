import clsx from "clsx";
import React from "react";
import { Dialog } from "radix-ui";
import { Overlay } from "./Overlay";

interface ContentProps extends React.ComponentPropsWithoutRef<typeof Dialog.Content> {
	children: React.ReactNode;
	hideOverlay?: boolean;
}

/** The dialog's panel. */
export const Content: React.FC<ContentProps> = ({ children, className, hideOverlay = false, ...props }) => (
	<Dialog.Portal>
		{!hideOverlay && <Overlay />}
		<Dialog.Content
			className={clsx(
				"fixed z-50 bg-raised outline-none",
				className
			)}
			{...props}
		>
			{children}
		</Dialog.Content>
	</Dialog.Portal>
);
