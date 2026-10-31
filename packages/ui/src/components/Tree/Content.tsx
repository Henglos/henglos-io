import React from "react";
import { useTreeItemContext } from "./context";

interface ContentProps {
	children: React.ReactNode;
}

/** An item's children — shown while it's expanded. */
export const Content: React.FC<ContentProps> = ({ children }) => {
	const { expanded } = useTreeItemContext();

	if (!expanded) return null;

	return <div className="flex flex-col">{children}</div>;
};
