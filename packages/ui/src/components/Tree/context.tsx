import { createContext, useContext } from "react";

/** What a tree shares: the selected value, and how to change it. */
export type TreeContextProps = {
	value?: string;
	onValueChange?: (value: string) => void;
};

/** The tree's selection, for its items. */
export const TreeContext = createContext<TreeContextProps>({});
/** The tree around this item. */
export const useTreeContext = () => useContext(TreeContext);

/** What an item tells its children: whether it's expanded, and how deep it is. */
export type TreeItemContextProps = {
	expanded: boolean;
	depth: number;
};

/** The item around these children. */
export const TreeItemContext = createContext<TreeItemContextProps>({ expanded: true, depth: 0 });
/** The item around this one — its depth and whether it's expanded. */
export const useTreeItemContext = () => useContext(TreeItemContext);
