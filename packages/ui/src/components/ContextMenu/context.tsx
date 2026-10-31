import { createContext, useContext } from "react";

type Position = { x: number; y: number };

/** What a context menu's parts read from it. */
export type ContextMenuContextProps = {
	open: boolean;
	position: Position;
	openMenu: (position: Position) => void;
	closeMenu: () => void;
};

/** The context menu's state, for its parts. */
export const ContextMenuContext = createContext<ContextMenuContextProps | undefined>(undefined);

/** The context menu around this part. */
export const useContextMenuContext = () => {
	const context = useContext(ContextMenuContext);
	if (!context) throw new Error("[ContextMenu] Component Internal Error (Context)");
	return context;
};
