"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Input, Skeleton, Text, emitToast } from "@henglosio/ui";
import { ArrowUpRight, FileUp, GitFork, Laptop, Loader2, Package, Plus, Search, Workflow, X, Zap } from "lucide-react";
import { HIO_EXTENSION } from "@henglosio/shared/browser";
import clsx from "clsx";
import { ActivityBar } from "@/shared/components/ActiveBar.component";
import { importWorkflow, listDrivers, listPackages, listWorkflows } from "@shared/api";
import { DayMessageLayout } from "./layouts/DayMessage.layout";
import { WorkflowCard } from "./components/WorkflowCard.component";
import { CreateWorkflowPanel } from "./panels/CreateWorkflowPanel.panel";
import { UpdateAlert } from "./components/UpdateAlert.component";

// Everything at once, searched here — so the counts stay put while typing.
const WORKFLOWS_LIMIT = 500;

export const HubFeature = () => {

	const queryClient = useQueryClient();
	const [query, setQuery] = useState("");
	const [board, setBoard] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);

	const { data, isLoading } = useQuery({
		queryKey: ["workflows"],
		queryFn: () => listWorkflows({ length: WORKFLOWS_LIMIT }),
	});
	const { data: drivers, isLoading: loadingDrivers } = useQuery({ queryKey: ["drivers"], queryFn: listDrivers });
	const { data: packages, isLoading: loadingPackages } = useQuery({ queryKey: ["packages"], queryFn: () => listPackages() });

	const workflows = data?.workflows ?? [];
	const actions = workflows.reduce((sum, workflow) => sum + workflow.actions, 0);
	const online = drivers?.filter(driver => driver.online).length ?? 0;

	// The boards the workflows target, most used first — the filter chips.
	const boards = useMemo(() => {
		const uses = new Map<string, number>();
		for (const workflow of workflows) uses.set(workflow.board, (uses.get(workflow.board) ?? 0) + 1);
		return [...uses.entries()].sort((a, b) => b[1] - a[1]);
	}, [workflows]);

	const shown = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return workflows
			.filter(workflow => !board || workflow.board === board)
			.filter(workflow => !needle || [workflow.name, workflow.description, workflow.board].some(field => field.toLowerCase().includes(needle)));
	}, [workflows, board, query]);

	// Import: a .hio becomes a new workflow; the server installs what it needs.
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { mutate: importFile, isPending: importing } = useMutation({
		mutationFn: importWorkflow,
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["workflows"] });
			queryClient.invalidateQueries({ queryKey: ["packages"] });
			const installed = result.installed.length > 0
				? ` — installed ${result.installed.length} package${result.installed.length === 1 ? "" : "s"}`
				: "";
			// What didn't fit was imported anyway: said until dismissed, one per line.
			if (result.warnings.length > 0) {
				emitToast("warning", `Imported "${result.name}"${installed} — with ${result.warnings.length} problem${result.warnings.length === 1 ? "" : "s"}`, {
					detail: result.warnings.join("\n"),
					duration: 0,
				});
			} else {
				emitToast("success", `Imported "${result.name}"${installed}`);
			}
		},
		// errors are surfaced by the http interceptor's toast
	});

	const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		// The same file can be picked again after a failed import.
		event.target.value = "";
		if (!file) return;
		if (!file.name.toLowerCase().endsWith(HIO_EXTENSION)) {
			emitToast("error", `Pick a ${HIO_EXTENSION} file`);
			return;
		}
		importFile(file);
	};

	const filtering = !!query.trim() || !!board;

	return (

		<main className="flex w-full h-full bg-canvas overflow-hidden">

			<ActivityBar />

			<section className="w-full flex flex-col flex-1 min-h-0">

				<div className="flex justify-center w-full flex-1 min-h-0 overflow-y-auto">

					{/* h-fit: as tall as its content, so the page scrolls instead of squeezing it. */}
					<div className="w-5xl h-fit flex flex-col gap-6 p-6">

						<DayMessageLayout />

						{/* A newer HenglosIO was released — only shown when there is one. */}
						<UpdateAlert />

						{/* Overview — drivers and packages open their pages */}
						<div className="flex border border-line rounded-xl divide-x divide-line bg-panel overflow-hidden">
							<Stat label="Workflows" icon={<GitFork size={14} />} loading={isLoading} value={workflows.length} />
							<Stat label="Actions" icon={<Zap size={14} />} loading={isLoading} value={actions} />
							<Stat label="Drivers online" icon={<Laptop size={14} />} loading={loadingDrivers} value={online} total={drivers?.length} href="/drivers" />
							<Stat label="Packages" icon={<Package size={14} />} loading={loadingPackages} value={packages?.length ?? 0} href="/library" />
						</div>

						{/* Workflows */}
						<div className="flex flex-col gap-4">

							<div className="flex items-center gap-2">
								<Text variant="high" size="lg" className="font-bold">Workflows</Text>

								<input ref={fileInputRef} type="file" accept={HIO_EXTENSION} className="hidden" onChange={onPickFile} />
								<Button.Root variant="ghost" size="md" className="ml-auto" disabled={importing} onClick={() => fileInputRef.current?.click()}>
									<Button.Icon>{importing ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}</Button.Icon>
									<Button.Label>{importing ? "Importing…" : "Import"}</Button.Label>
								</Button.Root>

								<Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
									<Dialog.Trigger asChild>
										<Button.Root variant="primary" size="md">
											<Button.Icon><Plus size={16} /></Button.Icon>
											<Button.Label>New workflow</Button.Label>
										</Button.Root>
									</Dialog.Trigger>
									<Dialog.Overlay />
									{createOpen && <CreateWorkflowPanel onClose={() => setCreateOpen(false)} />}
								</Dialog.Root>
							</div>

							<Input.Root>
								<Input.Icon><Search size={14} /></Input.Icon>
								<Input.Field
									placeholder="Search by name, description or board…"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
								/>
								{query && (
									<button type="button" onClick={() => setQuery("")} className="pr-2 flex items-center text-fg-muted hover:text-fg cursor-pointer" aria-label="Clear search">
										<X size={14} />
									</button>
								)}
							</Input.Root>

							{boards.length > 1 && (
								<div className="flex flex-wrap gap-1.5">
									<Chip active={!board} onClick={() => setBoard(null)} label="All boards" count={workflows.length} />
									{boards.map(([name, count]) => (
										<Chip key={name} active={board === name} onClick={() => setBoard(current => current === name ? null : name)} label={name} count={count} />
									))}
								</div>
							)}

							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

								{isLoading && Array.from({ length: 6 }, (_, i) => (
									<Skeleton key={i} className="h-40 w-full rounded-xl" />
								))}

								{shown.map(workflow => <WorkflowCard key={workflow.id} workflow={workflow} />)}

								{!isLoading && workflows.length === 0 && (
									<NoWorkflows onCreate={() => setCreateOpen(true)} onImport={() => fileInputRef.current?.click()} />
								)}

								{!isLoading && workflows.length > 0 && shown.length === 0 && filtering && (
									<div className="col-span-full flex flex-col items-center gap-3 py-12 rounded-xl border border-dashed border-line bg-panel">
										<Text variant="dim" size="sm">
											{query.trim() ? `Nothing matches "${query.trim()}"${board ? ` on ${board}` : ""}.` : `No workflows on ${board}.`}
										</Text>
										<Button.Root variant="surface" size="md" onClick={() => { setQuery(""); setBoard(null); }}>
											<Button.Label>Clear filters</Button.Label>
										</Button.Root>
									</div>
								)}

							</div>

						</div>

					</div>

				</div>

			</section>

		</main>

	);

};

// A Library-style stat; with `href` it opens that page.
const Stat: React.FC<{
	label: string;
	icon: React.ReactNode;
	value: number;
	total?: number;
	loading: boolean;
	href?: string;
}> = ({ label, icon, value, total, loading, href }) => {

	const content = (
		<>
			<div className="flex items-center text-xs">
				<Text variant="low" size="xs" className="uppercase">{label}</Text>
				<span className="ml-auto text-fg-muted group-hover/stat:text-accent transition-colors">
					{href ? <><span className="group-hover/stat:hidden">{icon}</span><ArrowUpRight size={14} className="hidden group-hover/stat:block" /></> : icon}
				</span>
			</div>
			{loading
				? <Skeleton className="h-10 w-14 rounded" />
				: (
					<span className="flex items-baseline gap-1">
						<span className="text-fg text-[36px] leading-10 tabular-nums">{value}</span>
						{total !== undefined && <span className="text-fg-muted text-sm tabular-nums">/ {total}</span>}
					</span>
				)}
		</>
	);

	if (!href) return <div className="flex flex-col gap-2 w-full px-4 py-4">{content}</div>;

	return (
		<Link href={href} className="group/stat flex flex-col gap-2 w-full px-4 py-4 transition-colors hover:bg-hover outline-none focus-visible:bg-hover">
			{content}
		</Link>
	);

};

const Chip: React.FC<{ label: string; count: number; active: boolean; onClick: () => void }> = ({ label, count, active, onClick }) => (
	<button
		type="button"
		onClick={onClick}
		aria-pressed={active}
		className={clsx(
			"flex items-center gap-1.5 px-2.5 h-7 rounded-md border text-xs cursor-pointer transition-colors",
			active
				? "bg-accent-subtle border-accent-line text-accent-fg"
				: "bg-panel border-line text-fg-secondary hover:bg-hover hover:text-fg",
		)}
	>
		{label}
		<span className={clsx("tabular-nums", active ? "text-accent-fg/70" : "text-fg-muted")}>{count}</span>
	</button>
);

// First run: what a workflow is, and the two ways to get one.
const NoWorkflows: React.FC<{ onCreate: () => void; onImport: () => void }> = ({ onCreate, onImport }) => (
	<div className="col-span-full flex flex-col items-center gap-4 py-16 px-6 rounded-xl border border-dashed border-line bg-panel text-center">
		<div className="flex items-center justify-center size-12 rounded-xl border border-line-subtle bg-field text-fg-muted">
			<Workflow size={20} />
		</div>
		<div className="flex flex-col gap-1 max-w-md">
			<Text variant="high" size="md">No workflows yet</Text>
			<Text variant="low" size="sm">
				A workflow is what your board runs: actions wired together on a canvas. Start one for a board in your
				library, or import a {HIO_EXTENSION} file someone shared.
			</Text>
		</div>
		<div className="flex items-center gap-2">
			<Button.Root variant="ghost" size="md" onClick={onImport}>
				<Button.Icon><FileUp size={14} /></Button.Icon>
				<Button.Label>Import</Button.Label>
			</Button.Root>
			<Button.Root variant="primary" size="md" onClick={onCreate}>
				<Button.Icon><Plus size={14} /></Button.Icon>
				<Button.Label>New workflow</Button.Label>
			</Button.Root>
		</div>
	</div>
);
