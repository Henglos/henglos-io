import { createContext, useContext } from "react";

/** What an input's parts share: the field's element, and whether it can be scrubbed. */
export type InputContextProps = {
	value: string | number | undefined;
	hasSegment: boolean;
	/** A Handler is present — the value is numeric, so Field also steps it with ↑/↓. */
	scrubbable: boolean;
	setScrubbable: (scrubbable: boolean) => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
}

/** The input's shared state, for its parts. */
export const InputContext = createContext<InputContextProps | undefined>(undefined);

/** The input around this part. */
export const useInputContext = () => {
	const context = useContext(InputContext);
	if (!context) throw new Error("[Input] Component Internal Error (Context)");
	return context;
}
