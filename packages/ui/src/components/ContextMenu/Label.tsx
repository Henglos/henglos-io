import clsx from "clsx";
import React from "react";
import { Text } from "../Text";

interface LabelProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "onChange"> {
	children: React.ReactNode;
}

/** A heading among the menu's choices. */
export const Label: React.FC<LabelProps> = ({ children, className, ...props }) => {
	return (
		<Text
			size="md"
			className={clsx(
				"flex items-center px-2 py-2 text-fg-muted uppercase tracking-wide select-none",
				className
			)}
			{...props}
		>
			{children}
		</Text>
	);
};
