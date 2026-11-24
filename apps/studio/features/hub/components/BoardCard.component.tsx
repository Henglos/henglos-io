import { Badge, Button, Select, Text } from "@henglosio/ui";
import clsx from "clsx";
import { useState } from "react";
import { satisfies } from "semver";
import type { BasePackage } from "@shared/types/package.types";

type BoardCardProps = {
	name: string;
	description: string;
	author: string;
	versions: {
		id: string;
		version: string;
		platform: string;
	}[];
	// Undefined while the platform versions are still loading: nothing's compatible yet.
	targetPlatform: string | undefined;
	disabled?: boolean;
	/** The version picked, when it's one of this board's — its select starts on it. */
	selectedId?: string;
	onSelect: (pkg: BasePackage) => void;
};

export const BoardCard: React.FC<BoardCardProps> = ({
	name,
	description,
	author,
	versions,
	targetPlatform,
	disabled,
	selectedId,
	onSelect,
}) => {
	const compatibleVersions = targetPlatform
		// A prerelease platform (1.6.1-dev.0) is in a package's range like its release.
		? versions.filter((v) => satisfies(targetPlatform, v.platform, { includePrerelease: true }))
		: [];
	const hasCompatibleVersions = compatibleVersions.length > 0;

	// The version picked, or the first compatible one — recomputed every
	// render, so a pick that stopped being compatible (another platform
	// chosen, or the list loaded late) falls back instead of staying empty.
	const [pickedId, setVersionSelectedId] = useState<string | undefined>(selectedId);
	const versionSelectedId = compatibleVersions.some((v) => v.id === pickedId)
		? pickedId!
		: compatibleVersions[0]?.id ?? "";
	// Another version of the selected board can still be picked.
	const selected = selectedId !== undefined && versionSelectedId === selectedId;

	const handleSelect = () => {
		const picked = compatibleVersions.find((v) => v.id === versionSelectedId);
		if (!picked) return;
		onSelect({ id: picked.id, name, version: picked.version, platform: picked.platform });
	};

	return (
		<div
			className={clsx(
				"flex flex-col items-start gap-2 h-fit select-none",
				disabled && "opacity-40 pointer-events-none"
			)}
		>
			<div className="flex gap-2 items-center justify-between w-full">
				<div className="flex items-center gap-2">
					<span className="text-fg text-sm font-medium">
						{name}
					</span>
				</div>
				<span className="text-fg-muted text-sm font-mono">
					@{author}
				</span>
			</div>

			<p className="text-fg-secondary text-xs font-mono leading-4">
				{description}
			</p>

			{!disabled && (
				<div
					className="flex items-center gap-2"
					onClick={(e) => e.stopPropagation()}
				>
					<Select.Root
						value={versionSelectedId}
						onValueChange={setVersionSelectedId}
					>
						<Select.Trigger placeholder="version" />
						<Select.Content>
							{compatibleVersions.map((v) => (
								<Select.Item key={v.id} value={v.id}>
									<Text>{v.version}</Text>
								</Select.Item>
							))}
						</Select.Content>
					</Select.Root>

					{!selected ? (
						<Button.Root
							variant="primary"
							size="md"
							disabled={!hasCompatibleVersions || !versionSelectedId}
							onClick={handleSelect}
						>
							<Button.Label>Select</Button.Label>
						</Button.Root>
					) : (

						<Text size="md" className="text-accent-fg">Selected</Text>

					)
				}
				</div>
			)}
		</div>
	);
};
