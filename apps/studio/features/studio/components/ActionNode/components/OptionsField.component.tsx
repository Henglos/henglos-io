import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { Dropdown, Select, Text } from "@henglosio/ui";
import type { IOptionEntrySchema, IOptionValueSchema } from "@henglosio/workflow";

export const flattenOptions = (options: IOptionEntrySchema[]): IOptionValueSchema[] =>
	options.flatMap(option => "categoryName" in option ? option.options : [option]);

export type OptionsFieldProps = {
	value: string | undefined;
	options: IOptionEntrySchema[];
	onChange: (value: string) => void;
	/** Its width — 12rem when not given. */
	className?: string;
};

// A real select — one of the declared options; categories group them. A
// value that isn't one of them (an older workflow's) shows as it is until
// another is picked.
export const OptionsField: React.FC<OptionsFieldProps> = ({ value, options, onChange, className }) => {

	// Grouped (the conditions' operations — by type): a menu of the groups, each opening its options beside it.
	if (options.some(option => "categoryName" in option)) {
		return <CategorizedOptionsField value={value} options={options} onChange={onChange} className={className} />;
	}

	const flat = flattenOptions(options);
	const known = flat.some(option => option.value === value);

	return (
		<Select.Root value={known ? value : ""} onValueChange={onChange} className={clsx("nodrag", className ?? "w-48")}>
			<Select.Trigger placeholder={value && !known ? value : "Pick one"} />
			<Select.Content>
				{options.length === 0 && <Text variant="low" size="xs" className="px-2 py-1.5">No options</Text>}
				{options.map(option => "categoryName" in option ? null : (
					<Select.Item key={option.value} value={option.value}>{option.displayName}</Select.Item>
				))}
			</Select.Content>
		</Select.Root>
	);

};

/**
 * Options in groups, n8n style: the menu lists the groups (String, Number,
 * Boolean…) — hovering one opens its options beside it. Ungrouped options
 * come first, at the top level. The box shows the group and the option picked.
 */
const CategorizedOptionsField: React.FC<OptionsFieldProps> = ({ value, options, onChange, className }) => {

	const picked = options.flatMap(option => "categoryName" in option
		? option.options.map(nested => ({ group: option.categoryName as string | undefined, option: nested }))
		: [{ group: undefined, option }])
		.find(entry => entry.option.value === value);

	const choice = (option: IOptionValueSchema) => (
		<Dropdown.Item key={option.value} onSelect={() => onChange(option.value)} className="text-xs! py-1.5! pl-2! pr-3!">
			<Check size={12} className={clsx("shrink-0", option.value === value ? "text-accent-fg" : "invisible")} />
			<span className="truncate">{option.displayName}</span>
		</Dropdown.Item>
	);

	return (
		<Dropdown.Root>
			<Dropdown.Trigger asChild>
				{/* Input.Root's box and Input.Field's text, exactly — it reads as one of the fields. */}
				<button
					type="button"
					className={clsx(
						"nodrag group h-8 bg-field hover:bg-field-hover focus-visible:bg-field-hover focus-visible:focus-ring border border-line rounded-md flex items-center relative outline-none cursor-pointer",
						className ?? "w-48",
					)}
				>
					<span className="flex-1 flex items-center gap-1.5 min-w-0 h-full px-2 text-xs leading-4 text-fg text-left">
						{picked ? (
							<>
								{picked.group && <span className="shrink-0 text-fg-muted">{picked.group}</span>}
								{picked.group && <span className="shrink-0 text-fg-muted">·</span>}
								<span className="truncate">{picked.option.displayName}</span>
							</>
						) : (
							<span className="truncate text-fg-muted">{value || "Pick one"}</span>
						)}
					</span>
					<ChevronDown size={16} className="shrink-0 mr-2 text-fg-muted transition-transform duration-150 group-data-[state=open]:rotate-180" />
				</button>
			</Dropdown.Trigger>
			<Dropdown.Content align="start" className="p-1! min-w-40">
				{options.map(option => "categoryName" in option ? null : choice(option))}
				{options.map(option => "categoryName" in option && (
					<Dropdown.Sub key={option.categoryName}>
						<Dropdown.SubTrigger className={clsx("text-xs! py-1.5! px-2!", picked?.group === option.categoryName && "text-accent-fg!")}>
							<span className={clsx("size-1.5 rounded-full shrink-0", picked?.group === option.categoryName ? "bg-accent-fg" : "bg-fg-muted/40")} />
							<span className="flex-1 truncate">{option.categoryName}</span>
							<span className="text-[10px] text-fg-muted tabular-nums">{option.options.length}</span>
						</Dropdown.SubTrigger>
						<Dropdown.SubContent className="p-1!">
							{option.options.map(choice)}
						</Dropdown.SubContent>
					</Dropdown.Sub>
				))}
			</Dropdown.Content>
		</Dropdown.Root>
	);

};
