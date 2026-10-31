import React, { useState, useCallback } from "react";
import { Input } from "../Input";
import { cn } from "../../utils/cn";

const sizeStyles = {
	"xs": "text-xs leading-4",
	"sm": "text-sm leading-4",
	"md": "text-base leading-5",
	"lg": "text-lg leading-5",
	"xl": "text-2xl leading-8"
}

const variantStyle = {
	"high": "text-fg",
	"dim": "text-fg-secondary",
	"low": "text-fg-muted",
	"contrast": "text-on-accent",
	"accent": "text-accent-fg"
}

const fontStyle = {
	"mono": "font-mono",
	"sans": "font-sans"
}

/** How a text looks: its size, color variant and font. */
export interface TextProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "onChange"> {
	children?: React.ReactNode;
	variant?: keyof typeof variantStyle;
	size?: keyof typeof sizeStyles;
	font?: keyof typeof fontStyle;
	editable?: boolean;
	dbClick?: boolean;
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	inputClassName?: string;
}

/** Text in the design system's sizes, colors and fonts. */
export const Text: React.FC<TextProps> = ({
	children,
	className,
	variant,
	size,
	font,
	editable,
	dbClick,
	value,
	onChange,
	placeholder = "Type something...",
	disabled,
	inputClassName,
	...props
}) => {

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value ?? "");

	const startEdit = useCallback(() => {
		if (!editable || disabled) return;
		setDraft(value ?? "");
		setEditing(true);
	}, [editable, disabled, value]);

	const commit = useCallback(() => {
		const trimmed = draft.trim();
		setEditing(false);
		if (trimmed !== value) {
			onChange?.(trimmed || (value ?? ""));
		}
	}, [draft, value, onChange]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			commit();
		}
		if (e.key === "Escape") {
			setEditing(false);
			setDraft(value ?? "");
		}
	}, [commit, value]);

	if (editable && editing) {
		return (
			<Input.Root value={draft}>
				<Input.Field
					autoFocus
					value={draft}
					placeholder={placeholder}
					className={inputClassName}
					onChange={e => setDraft(e.target.value)}
					onFocus={e => e.target.select()}
					onBlur={commit}
					onKeyDown={handleKeyDown}
				/>
			</Input.Root>
		);
	}

	const editProps = editable ? {
		[dbClick ? "onDoubleClick" : "onClick"]: startEdit,
		title: disabled ? undefined : (dbClick ? "Double click to edit" : "Click to edit"),
	} : {};

	return (
		<span
			className={cn(
				variant && variantStyle[variant],
				size && sizeStyles[size],
				font && fontStyle[font],
				editable && !disabled && "cursor-text select-none",
				editable && disabled && "cursor-default opacity-50",
				className
			)}
			{...editProps}
			{...props}
		>
			{editable && value !== undefined
				? (value || <span className="text-fg-muted">{placeholder}</span>)
				: children
			}
		</span>
	);
}
