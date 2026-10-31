import { Badge, Text } from "@henglosio/ui";
import type { PackageListItem } from "@henglosio/shared";
import { Box, ChevronRight } from "lucide-react";
import clsx from "clsx";

type PackageCardProps = {
	pkg: PackageListItem;
	installed: boolean;
	onSelect: (pkg: PackageListItem) => void;
};

export const PackageCard: React.FC<PackageCardProps> = ({ pkg, installed, onSelect }) => {

	const primaryVersion = pkg.versions[0];

	return (

		<div
			role="button"
			tabIndex={0}
			onClick={() => onSelect(pkg)}
			onKeyDown={e => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(pkg);
				}
			}}
			className="group/card flex items-center gap-3 mx-1.5 px-2 py-2 rounded-md hover:bg-hover focus-visible:bg-hover transition-colors cursor-pointer outline-none"
		>

			<div
				className={clsx(
					"flex items-center justify-center size-8 shrink-0 rounded-md border transition-colors",
					installed
						? "bg-accent-subtle border-accent-line text-accent"
						: "bg-field border-line-subtle text-fg-muted group-hover/card:text-fg-secondary",
				)}
			>
				<Box size={15} />
			</div>

			<div className="flex flex-col min-w-0 flex-1">

				<div className="flex items-center gap-2">
					<Text variant="high" size="sm" className="truncate">{pkg.name}</Text>
					{installed && <Badge variant="success">Added</Badge>}
				</div>

				{pkg.description && (
					<Text variant="low" size="xs" className="truncate">{pkg.description}</Text>
				)}

				{primaryVersion && (
					<div className="flex items-center gap-1.5 mt-0.5 min-w-0">
						<Text variant="low" size="xs" font="mono" className="shrink-0">
							v{primaryVersion.version}{pkg.versions.length > 1 ? ` +${pkg.versions.length - 1}` : ""}
						</Text>
						<Text variant="low" size="xs" className="shrink-0">·</Text>
						<Text variant="low" size="xs" className="truncate">{pkg.author}</Text>
					</div>
				)}

			</div>

			<ChevronRight size={14} className="shrink-0 text-fg-muted opacity-0 group-hover/card:opacity-100 group-focus-visible/card:opacity-100 transition-opacity" />

		</div>

	);

};
