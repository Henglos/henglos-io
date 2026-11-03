import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, Text, emitToast } from "@henglosio/ui";
import type { PackageListItem } from "@henglosio/shared";
import type { IBoardSchema, ICapability, IComponentSchema } from "@henglosio/workflow";
import { ArrowUpCircle, Blocks, Bluetooth, Box, CircuitBoard, EthernetPort, Gauge, History, Loader2, Network, PackagePlus, Trash, Usb, User, Wifi, X, Zap } from "lucide-react";
import { gt, rcompare, valid } from "semver";
import { addPackage, deletePackage, describeRegistryPackage, getPackageSchema } from "@shared/api";
import { AddPackagePanel } from "./AddPackagePanel.component";
import { componentNodes } from "@henglosio/workflow";
import { NodeMark } from "@/features/studio/components/ActionIcon/ActionIcon.component";
import { TriggerTag } from "@/features/studio/components/NodePorts/CardPort";

type LibraryPackageDetailProps = {
	pkg: PackageListItem;
	onClose: () => void;
};

/** The selected package: what it is, its versions (each removable), and what's inside it. */
export const LibraryPackageDetail: React.FC<LibraryPackageDetailProps> = ({ pkg, onClose }) => {

	const queryClient = useQueryClient();
	const isBoard = pkg.type === "board";
	const Icon = isBoard ? Blocks : Box;

	// What's inside — read from the latest version's schema.
	const latest = pkg.versions[0];
	const { data, isLoading } = useQuery({
		queryKey: ["package-schema", latest?.id],
		queryFn: () => getPackageSchema(latest!.id),
		enabled: !!latest,
	});

	// What the registry has: a version newer than any installed one is offered right here.
	const [picking, setPicking] = useState(false);
	const { data: registry } = useQuery({
		queryKey: ["registry-package", pkg.packageName],
		queryFn: () => describeRegistryPackage(pkg.packageName),
		staleTime: 60_000,
		retry: false,
	});
	const installedNewest = pkg.versions.map(v => v.version).filter(v => valid(v)).sort(rcompare)[0];
	const newer = registry?.latest && valid(registry.latest) && (!installedNewest || gt(registry.latest, installedNewest))
		? registry.latest
		: null;
	const { mutate: update, isPending: updating } = useMutation({
		mutationFn: (version: string) => addPackage(`${pkg.packageName}@${version}`),
		onSuccess: (_id, version) => {
			queryClient.invalidateQueries({ queryKey: ["packages"] });
			queryClient.invalidateQueries({ queryKey: ["registry-package", pkg.packageName] });
			emitToast("success", `v${version} added to your library`);
		},
	});

	const [removing, setRemoving] = useState<string | null>(null);
	const removeVersion = async (versionId: string, version: string) => {
		setRemoving(versionId);
		try {
			const { moved, detached } = await deletePackage(versionId);
			await queryClient.invalidateQueries({ queryKey: ["packages"] });
			await queryClient.invalidateQueries({ queryKey: ["workflow"] });
			emitToast("success", `Removed v${version} from your library`);
			// A board's workflows: moved to another version of it, or left without one.
			for (const workflow of moved) emitToast("success", `"${workflow.name}" now runs on v${workflow.version}`);
			for (const workflow of detached) emitToast("warning", `"${workflow.name}" has no board now — pick one with Edit, on the hub`);
		} catch {
			// the http interceptor already surfaces a detailed error toast
		} finally {
			setRemoving(null);
		}
	};

	return (

		<aside className="flex flex-col rounded-xl border border-line bg-panel overflow-hidden">

			<header className="flex items-start gap-3 p-4 border-b border-line-subtle">
				<div className="flex items-center justify-center size-10 shrink-0 rounded-lg border bg-accent-subtle border-accent-line text-accent">
					<Icon size={18} />
				</div>
				<div className="flex flex-col min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<Text variant="high" size="md" className="truncate">{pkg.name}</Text>
						<Badge variant={isBoard ? "brand" : "default"}>{isBoard ? "Board" : "Component"}</Badge>
					</div>
					<Text variant="low" size="xs" font="mono" className="truncate">{pkg.packageName}</Text>
				</div>
				<button type="button" onClick={onClose} className="shrink-0 mt-0.5 cursor-pointer text-fg-muted hover:text-fg" aria-label="Close">
					<X size={14} />
				</button>
			</header>

			<div className="flex flex-col gap-5 p-4">

				{pkg.description && <Text variant="dim" size="sm" className="leading-5">{pkg.description}</Text>}

				<div className="flex items-center gap-1.5 text-fg-muted">
					<User size={12} className="shrink-0" />
					<Text variant="low" size="xs" className="truncate">{pkg.author || "unknown"}</Text>
				</div>

				{newer && (
					<div className="flex items-center gap-2 px-3 py-2 rounded-md border border-accent-line bg-accent-subtle">
						<ArrowUpCircle size={14} className="shrink-0 text-accent" />
						<Text variant="high" size="xs" className="flex-1 min-w-0">v{newer} is out</Text>
						<Button.Root variant="primary" size="sm" disabled={updating} onClick={() => update(newer)}>
							<Button.Icon>{updating ? <Loader2 size={12} className="animate-spin" /> : <PackagePlus size={12} />}</Button.Icon>
							<Button.Label>Install</Button.Label>
						</Button.Root>
					</div>
				)}

				<Section
					title="Versions"
					count={pkg.versions.length}
					action={
						<Dialog.Root open={picking} onOpenChange={setPicking}>
							<Dialog.Trigger asChild>
								<button type="button" className="ml-auto flex items-center gap-1 text-fg-muted hover:text-fg cursor-pointer">
									<History size={11} />
									<Text variant="low" size="xs">Other versions</Text>
								</button>
							</Dialog.Trigger>
							<Dialog.Overlay />
							{picking && <AddPackagePanel initialName={pkg.packageName} onClose={() => setPicking(false)} />}
						</Dialog.Root>
					}
				>
					<div className="flex flex-col rounded-md border border-line-subtle divide-y divide-line-subtle overflow-hidden">
						{pkg.versions.map((version, index) => (
							<div key={version.id} className="group/version flex items-center gap-2 px-2.5 h-10">
								<Text variant="high" size="sm" font="mono">v{version.version}</Text>
								{/* The registry's "latest" — until it's known, the newest installed. */}
								{(registry ? version.version === registry.latest : index === 0) && <Badge variant="success">latest</Badge>}
								<Text variant="low" size="xs" font="mono" className="ml-auto truncate" title="Platform versions it works with">
									platform {version.platform}
								</Text>
								<Button.Root
									variant="ghost"
									size="sm"
									className="p-1.5! opacity-0 group-hover/version:opacity-100 focus-visible:opacity-100 transition-opacity"
									onClick={() => removeVersion(version.id, version.version)}
									disabled={removing !== null}
									title={`Remove v${version.version} from your library`}
								>
									<Button.Icon>
										{removing === version.id ? <Loader2 size={12} className="animate-spin" /> : <Trash size={12} />}
									</Button.Icon>
								</Button.Root>
							</div>
						))}
					</div>
				</Section>

				{isBoard
					? <BoardContents schema={data?.schema as IBoardSchema | undefined} loading={isLoading} />
					: <ComponentContents schema={data?.schema as IComponentSchema | undefined} loading={isLoading} />}

			</div>

		</aside>

	);

};

// Each capability (see @henglosio/workflow's CAPABILITIES) with its icon.
const CAPABILITY_ICONS: Record<ICapability, React.ReactNode> = {
	"wifi": <Wifi size={12} />,
	"bluetooth": <Bluetooth size={12} />,
	"ethernet": <EthernetPort size={12} />,
	"can": <Network size={12} />,
	"usb-host": <Usb size={12} />,
};

const Capabilities: React.FC<{ title: string; capabilities: ICapability[] | undefined; empty: string }> = ({ title, capabilities, empty }) => (
	<Section title={title} count={capabilities?.length}>
		{!capabilities ? (
			<Text variant="low" size="xs">{empty}</Text>
		) : capabilities.length === 0 ? (
			<Text variant="low" size="xs">None.</Text>
		) : (
			<div className="flex flex-wrap gap-1.5">
				{capabilities.map(capability => (
					<span key={capability} className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-accent-subtle border border-accent-line text-accent-fg">
						{CAPABILITY_ICONS[capability]}
						<Text variant="high" size="xs" font="mono">{capability}</Text>
					</span>
				))}
			</div>
		)}
	</Section>
);

// A component's actions — and what it needs of the board.
const ComponentContents: React.FC<{ schema: IComponentSchema | undefined; loading: boolean }> = ({ schema, loading }) => {
	// Its triggers, then its actions.
	const actions = schema ? componentNodes(schema) : [];
	return (
		<>
		{!loading && (schema?.capabilities?.length ?? 0) > 0 && (
			<Capabilities title="Needs" capabilities={schema!.capabilities} empty="" />
		)}
		<Section title="Actions" count={loading ? undefined : actions.length}>
			{loading && <Text variant="low" size="xs">Loading…</Text>}
			{!loading && actions.length === 0 && <Text variant="low" size="xs">No actions.</Text>}
			{actions.length > 0 && (
				<div className="flex flex-col rounded-md border border-line-subtle divide-y divide-line-subtle overflow-hidden">
					{actions.map(({ schema: action, trigger }) => (
						<div key={action.displayName} className="flex items-start gap-2.5 px-2.5 py-2">
							<NodeMark icon={action.icon} trigger={trigger} />
							<div className="flex flex-col min-w-0 flex-1">
								<div className="flex items-center gap-1.5 min-w-0">
									<Text variant="high" size="sm" className="truncate">{action.displayName}</Text>
									{trigger && <TriggerTag />}
								</div>
								{action.description && <Text variant="low" size="xs" className="line-clamp-2">{action.description}</Text>}
							</div>
						</div>
					))}
				</div>
			)}
		</Section>
		</>
	);
};

// A board's pins and how it connects.
const BoardContents: React.FC<{ schema: IBoardSchema | undefined; loading: boolean }> = ({ schema, loading }) => {
	if (loading || !schema) return <Section title="Board"><Text variant="low" size="xs">{loading ? "Loading…" : "No details."}</Text></Section>;

	const baudrates = schema.connection.serial?.baudrates ?? [];
	return (
		<>
		{/* What it offers besides its pins — what components needing one of these run on. */}
		<Capabilities title="Capabilities" capabilities={schema.capabilities} empty="Not declared — components aren't checked against it." />
		<Section title="Board">
			<div className="grid grid-cols-2 gap-2">
				<Fact icon={<CircuitBoard size={12} />} label="Pins" value={String(schema.pins.length)} />
				<Fact icon={<Gauge size={12} />} label="Default baud" value={baudrates[0] ? String(baudrates[0]) : "—"} />
			</div>
			<div className="flex flex-wrap gap-1">
				{schema.pins.map(pin => (
					<span
						key={pin.gpio}
						title={pin.type.join(", ")}
						className="px-1.5 h-5 inline-flex items-center rounded-sm bg-field border border-line-subtle font-mono text-xs text-fg-secondary"
					>
						{pin.displayName ?? `GPIO${pin.gpio}`}
					</span>
				))}
			</div>
		</Section>
		</>
	);
};

const Fact: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
	<div className="flex flex-col gap-1 px-2.5 py-2 rounded-md bg-field border border-line-subtle">
		<span className="flex items-center gap-1.5 text-fg-muted">
			{icon}
			<Text variant="low" size="xs">{label}</Text>
		</span>
		<Text variant="high" size="sm" font="mono">{value}</Text>
	</div>
);

const Section: React.FC<{ title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }> = ({ title, count, action, children }) => (
	<section className="flex flex-col gap-2">
		<div className="flex items-center gap-1.5">
			<Text variant="low" size="xs" font="mono" className="uppercase tracking-wide">{title}</Text>
			{count !== undefined && <Text variant="low" size="xs" className="tabular-nums">{count}</Text>}
			{action}
		</div>
		{children}
	</section>
);
