import { createContext, useContext } from "react";

/** What a toggle group's items share: the picked value(s). */
export type ToggleGroupContextProps = {
	value: string;
	onValueChange: (value: string) => void;
	size: "sm" | "md" | "lg";
};

/** The group's state, for its items. */
export const ToggleGroupContext = createContext<ToggleGroupContextProps | undefined>(undefined);

/** The toggle group around this item. */
export const useToggleGroupContext = () => {
	const ctx = useContext(ToggleGroupContext);
	if (!ctx) throw new Error("[ToggleGroup] Component Internal Error (Context)");
	return ctx;
};
