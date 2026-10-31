import React, { useRef } from "react";
import { Prefix } from "./Prefix";
import { TextareaContext } from "./context";
import clsx from "clsx";

interface RootTextareaProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	disable?: boolean;
	defaultValue?: string;
	value?: string;
}

/** The textarea's box — what its parts sit in. */
export const RootTextarea: React.FC<RootTextareaProps> = ({ children, defaultValue, value, disable, className, ...props }) => {

	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	let hasSegment = false;
	React.Children.forEach(children, (child) => {
		if (React.isValidElement(child) && child.type === Prefix) hasSegment = true;
	});

	return (
		<TextareaContext.Provider value={{ value: value ?? defaultValue, hasSegment, textareaRef }}>
			<div
				className={clsx(
					className,
					"w-full bg-field hover:bg-field-hover focus-within:bg-field-hover focus-within:focus-ring border border-line rounded-md flex items-start relative",
					hasSegment && "overflow-hidden",
					disable && "opacity-50 pointer-events-none",
				)}
				{...props}
			>
				{children}
			</div>
		</TextareaContext.Provider>
	);

}
