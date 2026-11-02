import React from "react";
import { useToggleContext } from "./context";
import { Text } from "../Text";

export interface LabelProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "onChange"> {
	children: React.ReactNode;
}

/** A toggle's text. */
export const Label: React.FC<LabelProps> = ({ children, className, ...props }) => {

	const { size } = useToggleContext();

	return (
		<Text font="sans" size={size} className={className} {...props}>
			{children}
		</Text>
	);

};
