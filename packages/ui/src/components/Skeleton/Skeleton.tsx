import clsx from "clsx";
import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/** A shimmering placeholder, shown while something loads. */
export const Skeleton: React.FC<SkeletonProps> = ({ ...props }) => {

	return (

		<div {...props} className={clsx("bg-active", props.className)}></div>

	);

}
