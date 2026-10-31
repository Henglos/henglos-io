import { createContext, useContext } from "react";

/** A toggle's look. */
export type ToggleVariant = "ghost" | "surface";
/** A toggle's size. */
export type ToggleSize = "sm" | "md" | "lg";

/** What a toggle's parts read from it: its variant, size and whether it's on. */
export type ToggleContextProps = {
	pressed: boolean;
	variant: ToggleVariant;
	size: ToggleSize;
};

/** A toggle's state, for its parts. */
export const ToggleContext = createContext<ToggleContextProps | undefined>(undefined);

/** The toggle around this part. */
export const useToggleContext = () => {
	const context = useContext(ToggleContext);
	if (!context) throw new Error("[Toggle] Component Internal Error (Context)");
	return context;
};
