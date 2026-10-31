import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import React from "react";

interface TriggerProps {
	placeholder?: string;
	className?: string;
}

/** The select's box: the picked value, and the chevron. */
export const Trigger: React.FC<TriggerProps> = ({ placeholder, className }) => {
	return (
		<SelectPrimitive.Trigger
			className={clsx(
				"group flex items-center h-8 w-full min-w-24 px-2 gap-2 outline-none text-fg",
				"bg-field border border-line rounded-md",
				"cursor-pointer transition-colors hover:bg-field-hover",
				className
			)}
		>
			<span className="flex-1 text-xs leading-4 text-left truncate min-w-0">
				<SelectPrimitive.Value
					placeholder={placeholder}
					className="text-fg"
				/>
			</span>
			<SelectPrimitive.Icon asChild>
				<ChevronDown
					size={16}
					className="shrink-0 text-fg-muted transition-transform duration-150 group-data-[state=open]:rotate-180"
				/>
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
};
