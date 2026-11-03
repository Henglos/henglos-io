import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Input, Text } from "@henglosio/ui";
import { PackageSearch, Search } from "lucide-react";
import type { PackageListItem } from "@henglosio/shared";
import type { IActionSchema, IComponentRuntime } from "@henglosio/workflow";
import { listPackages } from "@shared/api";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { PackageCard } from "./PackageCard.component";
import { PackageDetail } from "./PackageDetail.component";
import clsx from "clsx";

type Filter = "all" | "added";

type ComponentStoreListProps = {
	onActionAdded?: (component: IComponentRuntime) => void;
	onComponentAdded?: (component: IComponentRuntime) => void;
};

export const ComponentStoreList: React.FC<ComponentStoreListProps> = ({ onActionAdded, onComponentAdded }) => {

	const workflow = useAtomValue(WorkflowAtom);
	const mutate = useWorkflowMutate();
	const [query, setQuery] = useState<string>("");
	const [selectedPackage, setSelectedPackage] = useState<PackageListItem | null>(null);
	const [filter, setFilter] = useState<Filter>("all");

	const { data: packages, isLoading } = useQuery({
		queryKey: ["packages", "component", query],
		queryFn: () => listPackages({ q: query, type: "component" }),
	});

	const findExistingComponent = (versionId: string) =>
		workflow?.data.components.find(c => c.packageId === versionId);

	const ensureComponentInstalled = async (versionId: string): Promise<IComponentRuntime | undefined> => {

		const existing = findExistingComponent(versionId);
		if (existing) return existing;

		const previousIds = new Set((workflow?.data.components ?? []).map(c => c.id));

		const afterInstall = await mutate({ op: "add:component", packageId: versionId });
		if (!afterInstall) return undefined;

		return afterInstall.data.components.find(c => !previousIds.has(c.id));

	};

	const onAddComponent = async (versionId: string) => {

		const component = await ensureComponentInstalled(versionId);
		if (component) onComponentAdded?.(component);

	};

	const isInstalled = (pkg: PackageListItem) => !!pkg.versions.find(v => findExistingComponent(v.id));

	const addedCount = packages?.filter(isInstalled).length ?? 0;
	const visiblePackages = (packages ?? []).filter(pkg => filter === "all" || isInstalled(pkg));

	const onRemoveComponent = async (versionId: string) => {

		const existing = findExistingComponent(versionId);
		if (!existing) return;

		await mutate({ op: "remove:component", componentId: existing.id });

	}

	return (

		<div className="flex flex-col h-full min-h-0">

			{selectedPackage ? (

				<PackageDetail
					pkg={selectedPackage}
					installed={!!selectedPackage.versions.find(v => findExistingComponent(v.id))}
					onBack={() => setSelectedPackage(null)}
					onAddComponentCb={onAddComponent}
					onRemoveComponentCb={onRemoveComponent}
				/>

			) : (

				<>

					<div className="flex flex-col gap-2 px-2 pb-2 border-b border-line-subtle">

						<Input.Root className="h-6">
							<Input.Label>
								<Search size={13} />
							</Input.Label>
							<Input.Field
								placeholder="Search components..."
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</Input.Root>

						<div className="flex gap-0.5 p-0.5 rounded-md bg-field border border-line-subtle">
							<FilterTab label="All" count={packages?.length ?? 0} active={filter === "all"} onClick={() => setFilter("all")} />
							<FilterTab label="Added" count={addedCount} active={filter === "added"} onClick={() => setFilter("added")} />
						</div>

					</div>

					<div className="flex-1 overflow-y-auto py-1">

						{isLoading ? (

							<div className="flex flex-col items-center justify-center gap-2 h-full">
								<PackageSearch size={20} className="text-fg-muted" />
								<Text variant="low" size="xs">Loading...</Text>
							</div>

						) : visiblePackages.length === 0 ? (

							<div className="flex flex-col items-center justify-center gap-2 h-full">
								<PackageSearch size={20} className="text-fg-muted" />
								<Text variant="low" size="xs">
									{filter === "added" ? "No components added to this workflow yet." : "No components found"}
								</Text>
							</div>

						) : (

							<div className="flex flex-col gap-0.5">
								{visiblePackages.map(pkg => (
									<PackageCard
										key={pkg.name}
										pkg={pkg}
										installed={isInstalled(pkg)}
										onSelect={setSelectedPackage}
									/>
								))}
							</div>

						)}

					</div>

				</>

			)}

		</div>

	);

};

type FilterTabProps = {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
};

const FilterTab: React.FC<FilterTabProps> = ({ label, count, active, onClick }) => (
	<button
		type="button"
		onClick={onClick}
		className={clsx(
			"flex flex-1 items-center justify-center gap-1.5 h-6 rounded-sm text-xs cursor-pointer transition-colors outline-none focus-visible:bg-hover",
			active ? "bg-raised text-fg border border-line-subtle" : "text-fg-muted hover:text-fg-secondary border border-transparent",
		)}
	>
		{label}
		<span className="tabular-nums text-fg-muted">{count}</span>
	</button>
);
