import React, { useCallback, useEffect, useState } from "react";
import { ContextMenuContext } from "./context";

export interface RootContextMenuProps {
	children: React.ReactNode;
}

/** The context menu — where it is and whether it's open. */
export const RootContextMenu: React.FC<RootContextMenuProps> = ({ children }) => {
	const [open, setOpen] = useState(false);
	const [position, setPosition] = useState({ x: 0, y: 0 });

	const openMenu = useCallback((pos: { x: number; y: number }) => {
		setPosition(pos);
		setOpen(true);
	}, []);

	const closeMenu = useCallback(() => setOpen(false), []);

	useEffect(() => {
		if (!open) return;
		const handleMouseDown = () => closeMenu();
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") closeMenu();
		};
		document.addEventListener("mousedown", handleMouseDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handleMouseDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [open, closeMenu]);

	return (
		<ContextMenuContext.Provider value={{ open, position, openMenu, closeMenu }}>
			{children}
		</ContextMenuContext.Provider>
	);
};
