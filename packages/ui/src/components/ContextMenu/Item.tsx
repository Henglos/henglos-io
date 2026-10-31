import clsx from "clsx";
import React from "react";
import { useContextMenuContext } from "./context";

interface ItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: React.ReactNode;
	destructive?: boolean;
}

/** One choice of the menu. */
export const Item: React.FC<ItemProps> = ({
	children,
	destructive,
	className,
	onClick,
	...props
}) => {
	const { closeMenu } = useContextMenuContext();

	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		closeMenu();
		onClick?.(e);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			className={clsx(
				"flex items-center gap-2 w-full rounded-sm px-2 py-2 text-xs justify-between cursor-pointer transition-colors",
				destructive
					? "text-danger hover:bg-hover"
					: "text-fg hover:bg-hover",
				className
			)}
			{...props}
		>
			{children}
		</button>
	);
};
