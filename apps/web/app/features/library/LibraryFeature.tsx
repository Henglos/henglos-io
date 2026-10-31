"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, Input, Skeleton, Text } from "@henglosio/ui";
import { Blocks, Box, Layers, Package, PackagePlus, PackageSearch, Search, X } from "lucide-react";
import type { PackageListItem } from "@henglosio/shared";
import clsx from "clsx";
import { ActivityBar } from "@/shared/components/ActiveBar.component";
import { listPackages } from "@shared/api";
import { LibraryPackageCard } from "./components/LibraryPackageCard.component";
import { LibraryPackageDetail } from "./components/LibraryPackageDetail.component";
import { AddPackagePanel } from "./components/AddPackagePanel.component";

type TypeFilter = "all" | "board" | "component";

const EMPTY: Record<TypeFilter, string> = {
	all: "No packages in your library yet.",
	board: "No boards in your library yet.",
	component: "No components in your library yet.",
};

export const LibraryFeature = () => {

	const [query, setQuery] = useState("");
	const [type, setType] = useState<TypeFilter>("all");
	const [addOpen, setAddOpen] = useState(false);
	const [selectedName, setSelectedName] = useState<string | null>(null);

	// The whole library once; searched and filtered here, so the counts stay put while typing.
	const { data, isLoading } = useQuery({
		queryKey: ["packages"],
		queryFn: () => listPackages(),
	});

	const all = data ?? [];
	const counts = {
		all: all.length,
		board: all.filter(pkg => pkg.type === "board").length,
		component: all.filter(pkg => pkg.type === "component").length,
		versions: all.reduce((sum, pkg) => sum + pkg.versions.length, 0),
	};

	const shown = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return all
			.filter(pkg => type === "all" || pkg.type === type)
			.filter(pkg => !needle || [pkg.name, pkg.packageName, pkg.description, pkg.author].some(field => field?.toLowerCase().includes(needle)));
	}, [all, type, query]);

	// The detail follows the list: a package removed (its last version) closes it.
	const selected = all.find(pkg => pkg.name === selectedName) ?? null;

	const openAdd = () => setAddOpen(true);

	return (

		<main className="flex w-full h-full bg-canvas overflow-hidden">

			<ActivityBar />

			<section className="w-full flex flex-col flex-1 min-h-0">

				<div className="flex justify-center w-full flex-1 min-h-0 overflow-y-auto">

					{/* h-fit: as tall as its content, so the page scrolls instead of squeezing it. */}
					<div className="w-5xl h-fit flex flex-col gap-6 p-6">

						{/* Header */}
						<div className="flex items-end gap-4 pt-6">
							<div className="flex flex-col gap-1">
								<Text variant="high" size="xl" font="sans" className="font-bold">Library</Text>
								<Text variant="low" size="sm">
									The boards and components on your account — what your workflows are built from.
								</Text>
							</div>

							<Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
								<Dialog.Trigger asChild>
									<Button.Root variant="primary" size="md" className="ml-auto">
										<Button.Icon><PackagePlus size={16} /></Button.Icon>
										<Button.Label>Add package</Button.Label>
									</Button.Root>
								</Dialog.Trigger>
								<Dialog.Overlay />
								<AddPackagePanel onClose={() => setAddOpen(false)} />
							</Dialog.Root>
						</div>

						{/* Stats — also the type filter */}
						<div className="flex border border-line rounded-xl divide-x divide-line bg-panel overflow-hidden">
							<StatFilter label="All packages" icon={<Package size={14} />} value={counts.all} loading={isLoading} active={type === "all"} onClick={() => setType("all")} />
							<StatFilter label="Boards" icon={<Blocks size={14} />} value={counts.board} loading={isLoading} active={type === "board"} onClick={() => setType("board")} />
							<StatFilter label="Components" icon={<Box size={14} />} value={counts.component} loading={isLoading} active={type === "component"} onClick={() => setType("component")} />
							<StatFilter label="Versions" icon={<Layers size={14} />} value={counts.versions} loading={isLoading} />
						</div>

						{/* Search */}
						<Input.Root>
							<Input.Icon><Search size={14} /></Input.Icon>
							<Input.Field
								placeholder="Search by name, package, description or author…"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
							{query && (
								<button type="button" onClick={() => setQuery("")} className="pr-2 flex items-center text-fg-muted hover:text-fg cursor-pointer" aria-label="Clear search">
									<X size={14} />
								</button>
							)}
						</Input.Root>

						{/* Packages + the selected one's detail */}
						<div className={clsx("grid gap-4 items-start", selected && "lg:grid-cols-[1fr_20rem]")}>

							<div className={clsx("grid gap-3", selected ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>

								{isLoading && Array.from({ length: 6 }, (_, i) => (
									<Skeleton key={i} className="h-40 w-full rounded-xl" />
								))}

								{shown.sort((a,b) => {
									if (a.type === "board" && b.type !== "board") return -1;
									if (b.type === "board" && a.type !== "board") return 1;
									return a.name.localeCompare(b.name)
								}).map(pkg => (
									<LibraryPackageCard
										key={pkg.name}
										pkg={pkg}
										selected={pkg.name === selectedName}
										onSelect={(clicked: PackageListItem) => setSelectedName(current => current === clicked.name ? null : clicked.name)}
									/>
								))}

								{!isLoading && shown.length === 0 && (
									<EmptyState
										searching={!!query.trim()}
										message={query.trim() ? `Nothing matches "${query.trim()}".` : EMPTY[type]}
										onAdd={openAdd}
									/>
								)}

							</div>

							{selected && (
								<div className="lg:sticky lg:top-6">
									<LibraryPackageDetail key={selected.name} pkg={selected} onClose={() => setSelectedName(null)} />
								</div>
							)}

						</div>

					</div>

				</div>

			</section>

		</main>

	);

};

// A Hub-style stat that, when clickable, filters the list.
const StatFilter: React.FC<{
	label: string;
	icon: React.ReactNode;
	value: number;
	loading: boolean;
	active?: boolean;
	onClick?: () => void;
}> = ({ label, icon, value, loading, active, onClick }) => {

	const content = (
		<>
			<div className="flex items-center text-xs">
				<Text variant={active ? "high" : "low"} size="xs" className="uppercase">{label}</Text>
				<span className={clsx("ml-auto", active ? "text-accent" : "text-fg-muted")}>{icon}</span>
			</div>
			{loading
				? <Skeleton className="h-10 w-14 rounded" />
				: <span className="text-fg text-[36px] leading-10 tabular-nums">{value}</span>}
		</>
	);

	if (!onClick) return <div className="flex flex-col gap-2 w-full px-4 py-4">{content}</div>;

	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={clsx(
				"relative flex flex-col gap-2 w-full px-4 py-4 text-left cursor-pointer transition-colors",
				active ? "bg-raised" : "hover:bg-hover",
			)}
		>
			{content}
			{/* the active filter's underline */}
			<span className={clsx("absolute inset-x-0 bottom-0 h-0.5 transition-colors", active ? "bg-accent" : "bg-transparent")} />
		</button>
	);

};

const EmptyState: React.FC<{ message: string; searching: boolean; onAdd: () => void }> = ({ message, searching, onAdd }) => (
	<div className="col-span-full flex flex-col items-center justify-center gap-3 py-16 rounded-xl border border-dashed border-line bg-panel">
		<div className="flex items-center justify-center size-12 rounded-xl border border-line-subtle bg-field text-fg-muted">
			<PackageSearch size={20} />
		</div>
		<Text variant="dim" size="sm">{message}</Text>
		{!searching && (
			<Button.Root variant="surface" size="md" onClick={onAdd}>
				<Button.Icon><PackagePlus size={14} /></Button.Icon>
				<Button.Label>Add a package</Button.Label>
			</Button.Root>
		)}
	</div>
);
