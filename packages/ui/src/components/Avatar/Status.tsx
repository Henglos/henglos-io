import clsx from "clsx";
import React from "react";

type StatusType = "online" | "offline" | "busy";

const statusColor: Record<StatusType, string> = {
	online:  "bg-accent",
	offline: "bg-fg-secondary",
	busy:    "bg-danger",
};

export interface StatusProps extends React.HTMLAttributes<HTMLSpanElement> {
	type?: StatusType;
}

/** A dot on the avatar's corner: online, offline or busy. */
export const Status: React.FC<StatusProps> = ({ type = "online", className, ...props }) => (
	<span
		className={clsx(
			"size-2 rounded-full absolute right-0 bottom-0 border-2 border-line-subtle",
			statusColor[type],
			className
		)}
		{...props}
	/>
);
