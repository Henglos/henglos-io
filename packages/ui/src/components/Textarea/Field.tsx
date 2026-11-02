import React from "react";
import { useTextareaContext } from "./context";
import { cn } from "../../utils/cn";

export interface FieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/** The multi-line field itself. */
export const Field: React.FC<FieldProps> = ({ className, ...props }) => {

	const { textareaRef } = useTextareaContext();

	return (
		<textarea
			ref={textareaRef}
			className={cn(
				"w-full py-2 px-2 text-xs leading-4 text-fg placeholder:text-fg-muted resize-none bg-transparent outline-none focus-visible:shadow-none",
				className
			)}
			{...props}
		/>
	);

}
