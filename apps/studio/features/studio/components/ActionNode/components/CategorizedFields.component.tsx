import { Text } from "@henglosio/ui";
import type { IConfigurationRuntime } from "@henglosio/workflow";

type Group = { category: string | undefined; configurations: IConfigurationRuntime[] };

/**
 * `configurations` by their `category`: the ones without one first, as they
 * come; then each category in the order it first shows up, its configs in
 * theirs.
 */
export function groupByCategory(configurations: IConfigurationRuntime[]): Group[] {
	const loose: IConfigurationRuntime[] = [];
	const categories = new Map<string, IConfigurationRuntime[]>();
	for (const configuration of configurations) {
		const category = configuration.base.category;
		if (!category) loose.push(configuration);
		else categories.set(category, [...(categories.get(category) ?? []), configuration]);
	}
	return [
		...(loose.length > 0 ? [{ category: undefined, configurations: loose }] : []),
		...[...categories].map(([category, list]) => ({ category, configurations: list })),
	];
}

type CategorizedFieldsProps = {
	configurations: IConfigurationRuntime[];
	renderField: (configuration: IConfigurationRuntime) => React.ReactNode;
	/** The gap between fields, as the list around it spaces them. */
	gapClassName?: string;
};

/**
 * Fields in their categories (a config's `category`): each a section — its
 * title, bolder than a field's label, over a box holding its fields. The
 * uncategorized ones stay loose, before the sections.
 */
export const CategorizedFields: React.FC<CategorizedFieldsProps> = ({ configurations, renderField, gapClassName = "gap-4" }) => (
	<>
		{groupByCategory(configurations).map(({ category, configurations: fields }) => category === undefined
			? fields.map(renderField)
			: (
				<section key={`category:${category}`} className="flex flex-col gap-2 min-w-0">
					<Text variant="high" size="sm" className="font-semibold">{category}</Text>
					<div className={`flex flex-col ${gapClassName} rounded-md border border-line-subtle bg-field/30 p-3 min-w-0`}>
						{fields.map(renderField)}
					</div>
				</section>
			))}
	</>
);
