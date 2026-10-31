import clsx from "clsx";
import React from "react";
import { Dialog } from "radix-ui";

interface OverlayProps extends React.ComponentPropsWithoutRef<typeof Dialog.Overlay> {}

/** The dimmed backdrop behind the dialog. */
export const Overlay: React.FC<OverlayProps> = ({ className, ...props }) => (
	<Dialog.Overlay
		className={clsx(
			"fixed inset-0 z-50 bg-canvas/70",
			"data-[state=open]:animate-in data-[state=closed]:animate-out",
			"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className
		)}
		{...props}
	/>
);
