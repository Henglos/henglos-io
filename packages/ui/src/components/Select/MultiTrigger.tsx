import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import React from "react";
import { Text } from "../Text";
import { Tag } from "./Tag";

export interface MultiTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
	values: string[];
	onRemove: (value: string) => void;
	placeholder?: string;
}

/** The box of a multi-select: the picked values as tags, each removable. */
export const MultiTrigger: React.FC<MultiTriggerProps> = ({
	values,
	onRemove,
	placeholder,
	className,
	...props
}) => {
	return (
		<SelectPrimitive.Trigger asChild>
			<div
				className={clsx(
					"group flex items-center bg-field border border-line rounded-md cursor-pointer transition-colors hover:bg-field-hover",
					className
				)}
				{...props}
			>
				<div className="flex-1 px-2 py-2 flex flex-wrap items-center gap-2 min-h-8 max-w-48">
					{values.length === 0
						? <Text font="sans" variant="low" size="lg" className="leading-4">{placeholder}</Text>
						: values.map((v) => (
							<Tag
								key={v}
								onRemove={(e) => { e.stopPropagation(); onRemove(v); }}
							>
								{v}
							</Tag>
						))
					}
				</div>
				<div className="self-stretch flex items-center justify-center p-2 shrink-0">
					<ChevronDown
						size={16}
						className="text-fg-muted transition-transform duration-150 group-data-[state=open]:rotate-180"
					/>
				</div>
			</div>
		</SelectPrimitive.Trigger>
	);
};
