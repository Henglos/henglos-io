import { listPackages } from "@shared/api";
import { Badge, Input, Table } from "@henglosio/ui";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import React, { useState } from "react";
import { BoardCard } from "./BoardCard.component";
import type { BasePackage } from "@shared/types/package.types";

type BoardPickerProps = {
	/** Only versions that build against it are offered. */
	platform: string | undefined;
	/** The account package id picked (a board version). */
	selectedId: string | undefined;
	/** Shown in the header badge. */
	selectedLabel?: string;
	onSelect: (pkg: BasePackage) => void;
};

/** The board list of the hub's workflow dialogs (create, edit): search, one card per board. */
export const BoardPicker: React.FC<BoardPickerProps> = ({ platform, selectedId, selectedLabel, onSelect }) => {

	const [search, setSearch] = useState("");

	const { data: packages } = useQuery({
		queryKey: ["packages", "board", search],
		queryFn: () => listPackages({ q: search, type: "board" }),
	});

	return (
		<div className="flex flex-col gap-2 p-4 flex-1 min-w-0 overflow-hidden">

			<div className="flex items-center justify-between shrink-0">
				<span className="text-fg-muted text-xs uppercase tracking-wide">
					Target board
				</span>
				{selectedLabel && <Badge variant="success">{selectedLabel}</Badge>}
			</div>

			<Input.Root className="shrink-0">
				<Input.Icon><Search size={14} /></Input.Icon>
				<Input.Field
					placeholder="Search boards…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				{search && (
					<button
						type="button"
						onClick={() => setSearch("")}
						className="pr-2 flex items-center text-fg-muted hover:text-fg cursor-pointer"
					>
						<X size={14} />
					</button>
				)}
			</Input.Root>

			<Table.Root className="overflow-y-auto">
				{
					packages?.map((pkg) => (
						<Table.Row key={pkg.name}>
							<BoardCard
								name={pkg.name}
								description={pkg.description}
								author={pkg.author}
								versions={pkg.versions}
								targetPlatform={platform}
								selectedId={pkg.versions.some(v => v.id === selectedId) ? selectedId : undefined}
								onSelect={onSelect}
							/>
						</Table.Row>
					))
				}

				{packages?.length === 0 && (
					<div className="flex items-center justify-center p-8">
						<span className="text-fg-muted text-xs">
							No boards match "{search}"
						</span>
					</div>
				)}
			</Table.Root>

		</div>
	);

};
