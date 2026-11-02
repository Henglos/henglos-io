import { ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import React from "react";
import { cn } from "../../utils/cn";

export interface InputSelectProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root> {
	children: React.ReactNode;
	placeholder?: string;
	className?: string;
}

/** A small dropdown at the field's end, inside its box (a unit to pick). */
export const Select: React.FC<InputSelectProps> = ({ children, placeholder, className, ...props }) => {

	return (
		<SelectPrimitive.Root {...props}>
			<SelectPrimitive.Trigger
				className={cn(
					"group shrink-0 h-full flex items-center gap-2 px-2 border-l border-line",
					"text-xs text-fg-muted hover:text-fg outline-none focus-visible:shadow-none cursor-pointer transition-colors whitespace-nowrap",
					className
				)}
			>
				<span className="truncate max-w-24">
					<SelectPrimitive.Value placeholder={placeholder} />
				</span>
				<SelectPrimitive.Icon asChild>
					<ChevronDown
						size={12}
						className="shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180"
					/>
				</SelectPrimitive.Icon>
			</SelectPrimitive.Trigger>
			<SelectPrimitive.Portal>
				<SelectPrimitive.Content
					position="popper"
					sideOffset={4}
					className="z-50 min-w-(--radix-select-trigger-width) bg-overlay border border-line rounded-lg overflow-y-auto p-2 max-h-64"
				>
					<SelectPrimitive.Viewport>
						{children}
					</SelectPrimitive.Viewport>
				</SelectPrimitive.Content>
			</SelectPrimitive.Portal>
		</SelectPrimitive.Root>
	);

};
