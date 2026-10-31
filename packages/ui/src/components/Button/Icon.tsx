import clsx from "clsx";
import React from "react";

interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
	children: React.ReactNode;
}

/** An icon in a button, sized to it. */
export const Icon: React.FC<IconProps> = ({ children, className, ...props }) => {

	return (
		<span className={clsx("flex items-center justify-center shrink-0", className)} {...props}>
			{children}
		</span>
	);

}
