import React, { useRef, useState } from "react";
import { Prefix } from "./Prefix";
import { InputContext } from "./context";
import clsx from "clsx";

export interface RootInputProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	disable?: boolean;
	defaultValue?: string | number;
	value?: string | number;
}

/** The input's box — what its parts sit in. */
export const RootInput: React.FC<RootInputProps> = ({ children, defaultValue, value, disable, className, ...props }) => {

	const inputRef = useRef<HTMLInputElement | null>(null);
	// Set by Handler on mount — it can sit anywhere in the tree (e.g. inside a Tooltip), not just as a direct child.
	const [scrubbable, setScrubbable] = useState(false);

	let hasSegment = false;
	React.Children.forEach(children, (child) => {
		if (React.isValidElement(child) && child.type === Prefix) hasSegment = true;
	});

	return (
		<InputContext.Provider value={{ value: value ?? defaultValue, hasSegment, scrubbable, setScrubbable, inputRef }}>
			<div
				className={clsx(
					className,
					"w-full h-8 bg-field hover:bg-field-hover focus-within:bg-field-hover focus-within:focus-ring border border-line rounded-md flex items-center relative",
					hasSegment && "overflow-hidden",
					disable && "opacity-50 pointer-events-none",
				)}
				{...props}
			>
				{children}
			</div>
		</InputContext.Provider>
	);

}
