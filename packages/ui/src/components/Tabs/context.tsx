import { createContext, useContext } from "react";

/** What tabs share: the selected one, and how to change it. */
export type TabsContextProps = {
	value: string;
	onValueChange: (value: string) => void;
};

/** The tabs' state, for their parts. */
export const TabsContext = createContext<TabsContextProps | undefined>(undefined);

/** The tabs around this part. */
export const useTabsContext = () => {
	const ctx = useContext(TabsContext);
	if (!ctx) throw new Error("[Tabs] Component Internal Error (Context)");
	return ctx;
};
