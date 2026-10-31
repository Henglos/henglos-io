import clsx from "clsx";
import React from "react";
import { Dialog } from "radix-ui";

interface TitleProps extends React.ComponentPropsWithoutRef<typeof Dialog.Title> {}

/** The dialog's title (what screen readers announce). */
export const Title: React.FC<TitleProps> = ({ className, ...props }) => (
	<Dialog.Title
		className={clsx("text-fg text-sm font-medium", className)}
		{...props}
	/>
);
