import clsx from "clsx";
import { X } from "lucide-react";
import React from "react";
import { Text } from "../Text";

interface TagProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	onRemove?: (e: React.MouseEvent) => void;
}

/** One picked value of a multi-select, with its ×. */
export const Tag: React.FC<TagProps> = ({ children, onRemove, className, ...props }) => {

	return (
		<div
			className={clsx(
				"flex items-center gap-2 px-2 py-2 bg-active rounded shrink-0",
				className
			)}
			{...props}
		>
			<Text font="sans" variant="high" size="sm" className="leading-3.5 whitespace-nowrap">
				{children}
			</Text>
			{onRemove && (
				<button
					type="button"
					onClick={onRemove}
					className="flex items-center justify-center size-4 text-fg-muted hover:text-fg cursor-pointer transition-colors"
				>
					<X size={12} />
				</button>
			)}
		</div>
	);

};
