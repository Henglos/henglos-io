import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Select, Text } from "@henglosio/ui";
import type { PackageListItem } from "@henglosio/shared";
import type { IComponentSchema } from "@henglosio/workflow";
import { Box, ChevronLeft, Plus, Trash, User, Zap } from "lucide-react";
import clsx from "clsx";
import { getPackageSchema } from "@shared/api";
import { useAtomValue } from "jotai";
import { missingCapabilities } from "@henglosio/workflow";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { componentNodes } from "@henglosio/workflow";
import { NodeMark } from "@/features/studio/components/ActionIcon/ActionIcon.component";
import { TriggerTag } from "@/features/studio/components/NodePorts/CardPort";

type PackageDetailProps = {
	pkg: PackageListItem;
	installed: boolean;
	onBack: () => void;
	onAddComponentCb?: (versionId: string) => void;
	onRemoveComponentCb?: (versionId: string) => void;
};

export const PackageDetail: React.FC<PackageDetailProps> = ({ pkg, installed, onBack, onAddComponentCb: onAddComponentCb, onRemoveComponentCb }) => {

	const [versionId, setVersionId] = useState(pkg.versions[0]?.id ?? "");

	const { data, isLoading } = useQuery({
		queryKey: ["package-schema", versionId],
		queryFn: () => getPackageSchema(versionId),
		enabled: !!versionId,
	});

	const version = pkg.versions.find(v => v.id === versionId);
	const schema = data?.schema as IComponentSchema | undefined;
	// Its triggers, then its actions.
	const actions = schema ? componentNodes(schema) : [];
	// What it needs that this workflow's board doesn't have — it isn't added then.
	const board = useAtomValue(WorkflowAtom)?.data.board.base;
	const unsupported = missingCapabilities(board, schema?.capabilities ?? []);

	const onVersionChange = (value: string) => {
		setVersionId(value);
	};

	const onAddComponent = () => {
		onAddComponentCb?.(versionId);
	};

	const onRemoveComponent = () => {
		onRemoveComponentCb?.(versionId);
	}

	return (

		<div className="flex flex-col h-full min-h-0">

			<div className="flex items-center gap-1 px-2 pb-2 shrink-0 border-b border-line-subtle">
				<Button.Root variant="ghost" className="p-2!" onClick={onBack}>
					<Button.Icon>
						<ChevronLeft size={14} />
					</Button.Icon>
				</Button.Root>
				<Text variant="low" size="xs">Components</Text>
				<Text variant="low" size="xs">/</Text>
				<Text variant="high" size="xs" className="truncate">{pkg.name}</Text>
			</div>

			<div className="flex flex-col gap-5 p-4 overflow-y-auto flex-1 min-h-0">

				<div className="flex flex-col gap-3">

					<div className="flex items-center gap-3">

						<div
							className={clsx(
								"flex items-center justify-center size-10 shrink-0 rounded-lg border",
								installed ? "bg-accent-subtle border-accent-line text-accent" : "bg-field border-line-subtle text-fg-muted",
							)}
						>
							<Box size={18} />
						</div>

						<div className="flex flex-col min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<Text variant="high" size="md" className="truncate">{pkg.name}</Text>
								{installed && <Badge variant="success">Added</Badge>}
							</div>
							<Text variant="low" size="xs" font="mono" className="truncate">{pkg.packageName}</Text>
						</div>

					</div>

					{pkg.description && (
						<Text variant="low" size="xs">{pkg.description}</Text>
					)}

					<div className="flex items-center gap-1.5 text-fg-muted">
						<User size={12} className="shrink-0" />
						<Text variant="low" size="xs" className="truncate">{pkg.author}</Text>
					</div>

				</div>

				{(schema?.capabilities?.length ?? 0) > 0 && (
					<div className="flex flex-col gap-2">
						<SectionLabel>Needs</SectionLabel>
						<div className="flex flex-wrap gap-1">
							{schema!.capabilities!.map(capability => (
								<Badge key={capability} variant={unsupported.includes(capability) ? "error" : "default"}>{capability}</Badge>
							))}
						</div>
						{unsupported.length > 0 && (
							<Text variant="low" size="xs" className="text-danger!">
								{board?.name ?? "This board"} has no {unsupported.join(", ")} — this component can't run on it.
							</Text>
						)}
					</div>
				)}

				<div className="flex flex-col gap-2">

					<SectionLabel>Version</SectionLabel>

					{pkg.versions.length > 1 ? (
						<Select.Root value={versionId} onValueChange={onVersionChange}>
							<Select.Trigger placeholder="Version" className="h-8" />
							<Select.Content>
								{pkg.versions.map(v => (
									<Select.Item key={v.id} value={v.id}>{v.version}</Select.Item>
								))}
							</Select.Content>
						</Select.Root>
					) : (
						<div className="flex items-center h-8 px-2.5 rounded-md bg-field border border-line-subtle">
							<Text variant="dim" size="xs" font="mono">v{version?.version}</Text>
						</div>
					)}

				</div>

				<div className="flex flex-col gap-2">

					<SectionLabel count={isLoading ? undefined : actions.length}>Actions</SectionLabel>

					{isLoading && (
						<Text variant="low" size="xs">Loading actions...</Text>
					)}

					{!isLoading && actions.length === 0 && (
						<Text variant="low" size="xs">No actions available.</Text>
					)}

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
										{action.description && (
											<Text variant="low" size="xs">{action.description}</Text>
										)}
									</div>

								</div>
							))}
						</div>
					)}

				</div>

			</div>

			<div className="p-2 border-t border-line-subtle shrink-0">

				{

					installed ? (
						<Button.Root variant="destructive" size="md" className="w-full justify-center" onClick={onRemoveComponent}>
							<Button.Icon>
								<Trash size={14} />
							</Button.Icon>
							<Button.Label>
								Remove Component
							</Button.Label>
						</Button.Root>
					) : (

						<Button.Root
							variant="primary"
							size="md"
							className="w-full justify-center"
							onClick={onAddComponent}
							disabled={unsupported.length > 0}
							title={unsupported.length ? `Needs ${unsupported.join(", ")} — ${board?.name ?? "this board"} doesn't have ${unsupported.length === 1 ? "it" : "them"}` : undefined}
						>
							<Button.Icon>
								<Plus size={14} />
							</Button.Icon>
							<Button.Label>
								Add Component
							</Button.Label>
						</Button.Root>

					)

				}
			</div>

		</div>

	);

};

const SectionLabel: React.FC<{ children: React.ReactNode; count?: number }> = ({ children, count }) => (
	<div className="flex items-center gap-1.5">
		<Text variant="low" size="xs" font="mono" className="uppercase tracking-wide">{children}</Text>
		{count !== undefined && <Text variant="low" size="xs" className="tabular-nums">{count}</Text>}
	</div>
);
