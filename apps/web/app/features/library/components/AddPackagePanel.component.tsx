import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, Input, Skeleton, Text, emitToast } from "@henglosio/ui";
import type { RegistryPackageOut } from "@henglosio/shared";
import { Check, Loader2, PackagePlus, PackageSearch, Search, X } from "lucide-react";
import { DateTime } from "luxon";
import clsx from "clsx";
import { addPackage, describeRegistryPackage } from "@shared/api";

type AddPackagePanelProps = {
	onClose: () => void;
	/** Opens on this package, its versions already looked up — "Other versions" of an installed one. */
	initialName?: string;
};

// "name@1.2.0" -> { name, version }; scoped names keep their leading "@".
const splitSpec = (spec: string): { name: string; version?: string } => {
	const trimmed = spec.trim();
	const at = trimmed.lastIndexOf("@");
	return at > 0 ? { name: trimmed.slice(0, at), version: trimmed.slice(at + 1) || undefined } : { name: trimmed };
};

/**
 * Add a package to the library: find it on the registry by name, pick a
 * version — the latest one by default — and install it.
 */
export const AddPackagePanel: React.FC<AddPackagePanelProps> = ({ onClose, initialName }) => {

	const queryClient = useQueryClient();
	const [spec, setSpec] = useState(initialName ?? "");
	// What was looked up — the query runs on it, not on every keystroke.
	const [searched, setSearched] = useState<{ name: string; version?: string } | null>(initialName ? { name: initialName } : null);
	const [selected, setSelected] = useState<string | null>(null);

	const { data, isFetching, error } = useQuery({
		queryKey: ["registry-package", searched?.name],
		queryFn: () => describeRegistryPackage(searched!.name),
		enabled: !!searched?.name,
		retry: false,
		staleTime: 30_000,
	});

	// Once found: the version typed after "@", or the latest — or the newest one the account doesn't have yet.
	useEffect(() => {
		if (!data) return;
		const typed = searched?.version && data.versions.find(v => v.version === searched.version)?.version;
		const latest = data.versions.find(v => v.version === data.latest);
		const firstNew = data.versions.find(v => !v.installed);
		setSelected(typed ?? (latest && !latest.installed ? latest.version : firstNew?.version ?? latest?.version ?? null));
	}, [data, searched]);

	const search = () => {
		const next = splitSpec(spec);
		if (next.name) setSearched(next);
	};

	const { mutate: install, isPending } = useMutation({
		mutationFn: (version: string) => addPackage(`${data!.name}@${version}`),
		onSuccess: (_id, version) => {
			queryClient.invalidateQueries({ queryKey: ["packages"] });
			queryClient.invalidateQueries({ queryKey: ["registry-package", data!.name] });
			emitToast("success", `${data!.name}@${version} added to your library`);
			onClose();
		},
		// errors are surfaced by the http interceptor's toast
	});

	const choice = data?.versions.find(v => v.version === selected);
	// The http interceptor turns a failed request into an ApiError carrying the server's error id.
	const notFound = (error as { id?: string } | null)?.id === "registry_package_not_found";

	return (
		<Dialog.Content
			className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col w-lg max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] border border-line-strong rounded-lg overflow-hidden bg-raised"
			onEscapeKeyDown={onClose}
			onInteractOutside={onClose}
		>

			<div className="flex items-center justify-between px-4 py-4 border-b border-line shrink-0">
				<div className="flex flex-col">
					<Dialog.Title>Add package</Dialog.Title>
					<Text variant="low" size="xs">A board or component from the registry, at the version you pick.</Text>
				</div>
				<Dialog.Close asChild>
					<Button.Root size="md" variant="ghost" onClick={onClose}>
						<Button.Icon><X size={14} /></Button.Icon>
					</Button.Root>
				</Dialog.Close>
			</div>

			<div className="flex flex-col gap-4 p-4 min-h-0 overflow-y-auto">

				<div className="flex flex-col gap-2">
					<span className="text-fg-secondary text-xs">Package name</span>
					<div className="flex gap-2">
						<Input.Root className="flex-1">
							<Input.Icon><Search size={14} /></Input.Icon>
							<Input.Field
								autoFocus={!initialName}
								placeholder="e.g. @henglosio/component-display"
								value={spec}
								onChange={(e) => setSpec(e.target.value)}
								onKeyDown={(e) => { if (e.key === "Enter") search(); }}
							/>
						</Input.Root>
						<Button.Root variant="surface" size="md" onClick={search} disabled={!splitSpec(spec).name || isFetching}>
							<Button.Icon>{isFetching ? <Loader2 size={14} className="animate-spin" /> : <PackageSearch size={14} />}</Button.Icon>
							<Button.Label>Find</Button.Label>
						</Button.Root>
					</div>
					<Text variant="dim" size="xs">The npm name of a board or component — add @1.2.0 to go straight to a version.</Text>
				</div>

				{isFetching && !data && (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-5 w-48 rounded" />
						<Skeleton className="h-32 w-full rounded-md" />
					</div>
				)}

				{notFound && searched && (
					<div className="flex items-center justify-center py-6 rounded-md border border-dashed border-line">
						<Text variant="dim" size="sm">No package named <span className="font-mono text-fg">{searched.name}</span> on the registry.</Text>
					</div>
				)}

				{data && <VersionList pkg={data} selected={selected} onSelect={setSelected} />}

			</div>

			<div className="flex items-center justify-end gap-2 px-4 py-4 border-t border-line shrink-0">
				<Dialog.Close asChild>
					<Button.Root variant="ghost" onClick={onClose}>
						<Button.Label>Cancel</Button.Label>
					</Button.Root>
				</Dialog.Close>
				<Button.Root
					variant="primary"
					disabled={!choice || choice.installed || isPending}
					onClick={() => choice && install(choice.version)}
				>
					<Button.Icon>{isPending ? <Loader2 size={14} className="animate-spin" /> : choice?.installed ? <Check size={14} /> : <PackagePlus size={14} />}</Button.Icon>
					<Button.Label>
						{isPending ? "Installing…" : !choice ? "Install" : choice.installed ? `v${choice.version} installed` : `Install v${choice.version}`}
					</Button.Label>
				</Button.Root>
			</div>

		</Dialog.Content>
	);

};

// Every version, newest first — pick one.
const VersionList: React.FC<{ pkg: RegistryPackageOut; selected: string | null; onSelect: (version: string) => void }> = ({ pkg, selected, onSelect }) => (
	<div className="flex flex-col gap-2">

		<div className="flex flex-col">
			<Text variant="high" size="sm" font="mono" className="truncate">{pkg.name}</Text>
			{pkg.description && <Text variant="low" size="xs" className="line-clamp-2">{pkg.description}</Text>}
		</div>

		<div className="flex items-center gap-1.5">
			<Text variant="low" size="xs" font="mono" className="uppercase tracking-wide">Versions</Text>
			<Text variant="low" size="xs" className="tabular-nums">{pkg.versions.length}</Text>
		</div>

		<div role="radiogroup" aria-label="Version" className="flex flex-col max-h-64 overflow-y-auto rounded-md border border-line-subtle divide-y divide-line-subtle">
			{pkg.versions.map(version => {
				const active = version.version === selected;
				const published = version.publishedAt ? DateTime.fromISO(version.publishedAt) : null;
				return (
					<button
						key={version.version}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => onSelect(version.version)}
						className={clsx(
							"flex items-center gap-2.5 px-3 h-10 text-left cursor-pointer transition-colors outline-none focus-visible:bg-hover",
							active ? "bg-selected" : "hover:bg-hover",
						)}
					>
						<span className={clsx(
							"flex items-center justify-center size-3.5 shrink-0 rounded-full border",
							active ? "border-accent" : "border-line-strong",
						)}>
							{active && <span className="size-1.5 rounded-full bg-accent" />}
						</span>
						<Text variant={version.deprecated ? "low" : "high"} size="sm" font="mono" className={clsx(version.deprecated && "line-through")}>v{version.version}</Text>
						{version.version === pkg.latest && <Badge variant="success">latest</Badge>}
						{version.installed && <Badge>installed</Badge>}
						{version.deprecated && <span title={version.deprecated}><Badge variant="warning">deprecated</Badge></span>}
						{published && (
							<Text variant="low" size="xs" className="ml-auto shrink-0" title={published.toLocaleString(DateTime.DATETIME_MED)}>
								{published.toRelative()}
							</Text>
						)}
					</button>
				);
			})}
		</div>

	</div>
);
