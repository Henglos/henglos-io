import { Badge, Text } from "@henglosio/ui";
import type { PackageListItem } from "@henglosio/shared";
import { Blocks, Box, User } from "lucide-react";
import clsx from "clsx";

type LibraryPackageCardProps = {
	pkg: PackageListItem;
	selected: boolean;
	onSelect: (pkg: PackageListItem) => void;
};

/** One package of the library — same look as the studio's Component Store, as a card. */
export const LibraryPackageCard: React.FC<LibraryPackageCardProps> = ({ pkg, selected, onSelect }) => {

	const latest = pkg.versions[0];
	const isBoard = pkg.type === "board";
	const Icon = isBoard ? Blocks : Box;

	return (

		<button
			type="button"
			onClick={() => onSelect(pkg)}
			aria-pressed={selected}
			className={clsx(
				"group/card flex flex-col gap-3 p-4 rounded-xl border text-left transition-colors cursor-pointer outline-none",
				"focus-visible:ring-1 focus-visible:ring-accent-line",
				selected
					? "bg-raised border-accent-line ring-1 ring-accent-line"
					: "bg-panel border-line hover:bg-raised hover:border-line-strong",
			)}
		>

			<div className="flex items-start gap-3 w-full">

				<div
					className={clsx(
						"flex items-center justify-center size-10 shrink-0 rounded-lg border transition-colors",
						selected
							? "bg-accent-subtle border-accent-line text-accent"
							: "bg-field border-line-subtle text-fg-muted group-hover/card:text-fg-secondary",
					)}
				>
					<Icon size={18} />
				</div>

				<div className="flex flex-col min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<Text variant="high" size="md" className="truncate">{pkg.name}</Text>
						<Badge variant={isBoard ? "brand" : "default"}>{isBoard ? "Board" : "Component"}</Badge>
					</div>
					<Text variant="low" size="xs" font="mono" className="truncate">{pkg.packageName}</Text>
				</div>

			</div>

			<Text variant="low" size="sm" className="line-clamp-2 min-h-8">
				{pkg.description || "No description."}
			</Text>

			<div className="flex items-center gap-2 mt-auto pt-3 border-t border-line-subtle w-full min-w-0">
				{latest && (
					<span className="shrink-0 px-1.5 h-5 inline-flex items-center rounded-sm bg-field border border-line-subtle font-mono text-xs text-fg-secondary">
						v{latest.version}
					</span>
				)}
				{pkg.versions.length > 1 && (
					<Text variant="low" size="xs" className="shrink-0">+{pkg.versions.length - 1} more</Text>
				)}
				<span className="ml-auto flex items-center gap-1 min-w-0 text-fg-muted">
					<User size={11} className="shrink-0" />
					<Text variant="low" size="xs" className="truncate">{pkg.author || "unknown"}</Text>
				</span>
			</div>

		</button>

	);

};
