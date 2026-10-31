import clsx from "clsx";
import React from "react";
import { useContextMenuContext } from "./context";

interface TriggerProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	asChild?: boolean;
}

/** The area a right-click opens the menu on. */
export const Trigger: React.FC<TriggerProps> = ({
	children,
	asChild = false,
	className,
	onContextMenu,
	...props
}) => {
	const { openMenu } = useContextMenuContext();

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		openMenu({ x: e.clientX, y: e.clientY });
		onContextMenu?.(e as React.MouseEvent<HTMLDivElement>);
	};

	if (asChild && React.isValidElement(children)) {
		const child = children as React.ReactElement<any>;
		return React.cloneElement(child, {
			onContextMenu: (e: React.MouseEvent) => {
				handleContextMenu(e);
				child.props.onContextMenu?.(e);
			},
		});
	}

	return (
		<div
			className={clsx(className)}
			onContextMenu={handleContextMenu}
			{...props}
		>
			{children}
		</div>
	);
};
