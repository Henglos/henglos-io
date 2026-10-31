import clsx from "clsx";
import React from "react";
import { Text } from "../Text";

interface LabelProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "onChange"> {
	children: React.ReactNode;
}

/** A heading among the choices. */
export const Label: React.FC<LabelProps> = ({ children, className, ...props }) => {

	return (
		<Text
			font="sans"
			variant="high"
			size="lg"
			className={clsx("whitespace-nowrap", className)}
			{...props}
		>
			{children}
		</Text>
	);

};
