import clsx from "clsx";
import React from "react";
import { Tooltip } from "radix-ui";

interface ArrowProps extends React.ComponentPropsWithoutRef<typeof Tooltip.Arrow> {}

/** The tooltip's arrow, pointing at what it's about. */
export const Arrow: React.FC<ArrowProps> = ({ className, width = 8, height = 4, ...props }) => {
	return (
		<Tooltip.Arrow
			width={width}
			height={height}
			className={clsx("fill-overlay", className)}
			{...props}
		/>
	);
};
