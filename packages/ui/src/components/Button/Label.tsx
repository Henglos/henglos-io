import { Text } from "../Text";
import React from "react";
import clsx from "clsx";
import { useButtonContext } from "./context";

export interface LabelProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "onChange"> {
	children: React.ReactNode;
}

/** A button's text, styled for its variant and size. */
export const Label: React.FC<LabelProps> = ({ children, className, ...props }) => {

	const { size, variant } = useButtonContext();

	return (
		<Text
			font="mono"
			size={size}
			className={clsx(
				(variant === "accent" || variant === "primary") && "text-on-accent",
				variant === "destructive" && "text-danger",
				className
			)}
			{...props}
		>
			{children}
		</Text>
	);

}
