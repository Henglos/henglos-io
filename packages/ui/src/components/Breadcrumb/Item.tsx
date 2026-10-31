import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import React from "react";
import { Slot } from "radix-ui";

interface BreadcrumbItemProps extends React.HTMLAttributes<HTMLSpanElement> {
	children: React.ReactNode;
	current?: boolean;
	asChild?: boolean;
}

/** One step of the path — a link, or the current page. */
export const Item: React.FC<BreadcrumbItemProps> = ({
	children,
	current = false,
	className,
	asChild = false,
	...props
}) => {
	const Comp = (asChild ? Slot.Root : "span") as React.ElementType;

	return (
		<>
			<Comp
				aria-current={current ? "page" : undefined}
				className={clsx(
					"text-sm leading-4 whitespace-nowrap transition-colors",
					current
						? "text-fg"
						: "text-fg-muted hover:text-fg cursor-pointer",
					className
				)}
				{...props}
			>
				{children}
			</Comp>
			{!current && (
				<ChevronRight
					aria-hidden
					className="size-4 shrink-0 text-fg-muted"
				/>
			)}
		</>
	);
};
