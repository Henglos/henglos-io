import clsx from "clsx";
import React, { useLayoutEffect, useRef } from "react";
import { useContextMenuContext } from "./context";

interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

/** The menu's panel. */
export const Content: React.FC<ContentProps> = ({ children, className, onMouseDown, ...props }) => {
	const { open, position } = useContextMenuContext();
	const ref = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		if (!ref.current || !open) return;
		const { width, height } = ref.current.getBoundingClientRect();
		let x = position.x;
		let y = position.y;
		if (x + width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - width - 8);
		if (y + height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - height - 8);
		ref.current.style.left = `${x}px`;
		ref.current.style.top = `${y}px`;
		ref.current.style.opacity = "1";
	}, [open, position]);

	if (!open) return null;

	return (
		<div
			ref={ref}
			style={{ left: position.x, top: position.y, opacity: 0 }}
			className={clsx(
				"fixed z-50 min-w-40 bg-overlay rounded-lg border border-line p-2",
				className
			)}
			onMouseDown={(e) => { e.stopPropagation(); onMouseDown?.(e); }}
			{...props}
		>
			{children}
		</div>
	);
};
