import { createContext, useContext } from "react";

/** A button's look. */
export type ButtonVariant = "cursor" | "ghost" | "surface" | "primary" | "destructive" | "accent";
/** A button's size. */
export type ButtonSize = "sm" | "md" | "lg";

/** What a button's parts read from it: its variant and size. */
export type ButtonContextProps = {
	variant: ButtonVariant;
	size: ButtonSize;
}

/** A button's variant and size, for its parts. */
export const ButtonContext = createContext<ButtonContextProps | undefined>(undefined);

/** The button around this part — its variant and size. */
export const useButtonContext = () => {
	const context = useContext(ButtonContext);
	if (!context) throw new Error("[Button] Component Internal Error (Context)");
	return context;
}
