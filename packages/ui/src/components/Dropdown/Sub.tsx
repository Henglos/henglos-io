import clsx from "clsx";
import React from "react";
import { ChevronRight } from "lucide-react";
import { DropdownMenu } from "radix-ui";

export interface SubProps extends React.ComponentProps<typeof DropdownMenu.Sub> {}

/** A nested menu — its `SubTrigger` opens its `SubContent` beside it, on hover or the right arrow. */
export const Sub: React.FC<SubProps> = DropdownMenu.Sub;

export interface SubTriggerProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.SubTrigger> {
	children: React.ReactNode;
}

/** The entry that opens a nested menu — a chevron at its end. */
export const SubTrigger: React.FC<SubTriggerProps> = ({ children, className, ...props }) => {
	return (
		<DropdownMenu.SubTrigger
			className={clsx(
				"flex items-center gap-2 w-full rounded-sm px-4 py-2 text-sm text-fg cursor-pointer outline-none transition-colors",
				"hover:bg-hover data-highlighted:bg-hover data-[state=open]:bg-hover",
				className
			)}
			{...props}
		>
			{children}
			<ChevronRight size={14} className="ml-auto shrink-0 text-fg-muted" />
		</DropdownMenu.SubTrigger>
	);
};

export interface SubContentProps extends React.ComponentPropsWithoutRef<typeof DropdownMenu.SubContent> {
	children: React.ReactNode;
}

/** A nested menu's panel, beside its trigger. */
export const SubContent: React.FC<SubContentProps> = ({ children, className, sideOffset = 6, alignOffset = -8, ...props }) => {
	return (
		<DropdownMenu.Portal>
			<DropdownMenu.SubContent
				sideOffset={sideOffset}
				alignOffset={alignOffset}
				className={clsx(
					"z-50 min-w-40 max-w-72 max-h-72 bg-overlay border border-line rounded-lg overflow-y-auto p-2 shadow-lg",
					"data-[state=open]:animate-in data-[state=closed]:animate-out",
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
					"data-[side=right]:slide-in-from-left-1 data-[side=left]:slide-in-from-right-1",
					className
				)}
				{...props}
			>
				{children}
			</DropdownMenu.SubContent>
		</DropdownMenu.Portal>
	);
};
