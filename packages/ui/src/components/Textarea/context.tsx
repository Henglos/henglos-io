import { createContext, useContext } from "react";

/** What a textarea's parts share. */
export type TextareaContextProps = {
	value: string | undefined;
	hasSegment: boolean;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/** The textarea's shared state, for its parts. */
export const TextareaContext = createContext<TextareaContextProps | undefined>(undefined);

/** The textarea around this part. */
export const useTextareaContext = () => {
	const context = useContext(TextareaContext);
	if (!context) throw new Error("[Textarea] Component Internal Error (Context)");
	return context;
}
