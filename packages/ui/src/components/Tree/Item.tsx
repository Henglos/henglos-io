import clsx from "clsx";
import React, { useState } from "react";
import { Content } from "./Content";
import { TreeItemContext, useTreeContext, useTreeItemContext } from "./context";
import { ChevronRight } from "lucide-react";

interface ItemProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	value?: string;
	defaultExpanded?: boolean;
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	className?: string;
}

/** One row of the tree — selectable, and expandable when it has Content. */
export const Item: React.FC<ItemProps> = ({
	children,
	value,
	defaultExpanded = false,
	expanded: controlledExpanded,
	onExpandedChange,
	onClick,
	className,
	...props
}) => {
	const { value: selectedValue, onValueChange } = useTreeContext();
	const { depth } = useTreeItemContext();

	const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
	const isControlled = controlledExpanded !== undefined;
	const expanded = isControlled ? controlledExpanded : internalExpanded;

	const childArray = React.Children.toArray(children);
	const hasContent = childArray.some(
		child => React.isValidElement(child) && child.type === Content
	);
	const rowChildren = childArray.filter(
		child => !(React.isValidElement(child) && child.type === Content)
	);
	const contentChildren = childArray.filter(
		child => React.isValidElement(child) && child.type === Content
	);

	const isSelected = value !== undefined && value === selectedValue;

	const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (hasContent) {
			const next = !expanded;
			if (!isControlled) setInternalExpanded(next);
			onExpandedChange?.(next);
		}
		if (value && onValueChange) onValueChange(value);
		onClick?.(e);
	};

	const paddingLeft = depth * 12 + 8;

	return (
		<TreeItemContext.Provider value={{ expanded, depth: depth + 1 }}>
			<div className={clsx("flex flex-col", className)} {...props}>
				<div
					role="button"
					tabIndex={0}
					style={{ paddingLeft }}
					onDoubleClick={handleClick}
					className={clsx(
						"group/row flex items-center h-8 gap-2 w-full pr-2 cursor-pointer text-sm",
						isSelected
							? "bg-selected text-fg"
							: "text-fg-muted hover:text-fg hover:bg-hover"
					)}
				>
					<span
						className={clsx(
							"flex items-center justify-center shrink-0",
							hasContent ? "opacity-60" : "opacity-0 pointer-events-none",
							expanded ? "rotate-90" : "rotate-0"
						)}
						onClick={handleClick}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") handleClick(e as unknown as React.MouseEvent<HTMLDivElement>);
						}}
					>
						<ChevronRight size={14} color="var(--fg-muted)" />
					</span>
					{rowChildren}
				</div>
				{contentChildren}
			</div>
		</TreeItemContext.Provider>
	);
};
