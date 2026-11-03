import { useState } from "react";
import { Input, Text } from "@henglosio/ui";
import { Box, ChevronRight, GitBranch, Layers, Radio, Repeat, Search, Split, Zap } from "lucide-react";
import { componentNodes, isLogicComponent, withLogicComponent, type IActionSchema, type IComponentRuntime } from "@henglosio/workflow";
import clsx from "clsx";
import { TriggerTag } from "../NodePorts/CardPort";
import { ActionIcon } from "@/features/studio/components/ActionIcon/ActionIcon.component";

// Each Logic action's own icon — they read as flow, not as hardware.
const LogicIcon: React.FC<{ action: string }> = ({ action }) =>
	action === "Repeat" ? <Repeat size={12} /> : action === "Switch" ? <Split size={12} /> : <GitBranch size={12} />;

type ComponentGroup = {
	component: IComponentRuntime;
	/** Its triggers, then its actions. */
	actions: { schema: IActionSchema; trigger: boolean }[];
};

type RegisteredActionsListProps = {
	components: IComponentRuntime[];
	onSelect: (component: IComponentRuntime, action: IActionSchema) => void;
};

// "all" = sem componente selecionado — mostra as actions de todos agrupadas.
type Selection = "all" | string;

// Lista das actions de todos os componentes já registrados no workflow (sem
// buscar/instalar pacotes novos) — usada tanto pra inserir uma action no meio
// de uma connection quanto pra adicionar uma action solta a partir do Explorer.
// Dois painéis: componentes à esquerda, actions do selecionado à direita. A
// busca filtra os dois ao mesmo tempo (contagem por componente acompanha).
export const RegisteredActionsList: React.FC<RegisteredActionsListProps> = ({ components, onSelect }) => {

	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Selection>("all");

	const q = query.trim().toLowerCase();
	// The built-in Logic component is always offered — adding one of its
	// actions is what puts it in the workflow (see withLogicComponent).
	// Alphabetical, by the name shown.
	const groups: ComponentGroup[] = [...withLogicComponent({ components }).components]
		.sort((a, b) => a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" }))
		.map(component => ({
		component,
		actions: componentNodes(component.base).filter(({ schema: action }) =>
			!q ||
			action.displayName.toLowerCase().includes(q) ||
			action.description?.toLowerCase().includes(q) ||
			component.alias.toLowerCase().includes(q)
		),
	}));

	const total = groups.reduce((sum, group) => sum + group.actions.length, 0);

	// Se o componente selecionado sumiu (removido do workflow), volta pra "all".
	const selectedGroup = groups.find(group => group.component.id === selected);
	const visibleGroups = (selectedGroup ? [selectedGroup] : groups).filter(group => group.actions.length > 0);

	return (

		<>

			<div className="p-2 border-b border-line-subtle">
				<Input.Root className="h-6">
					<Input.Label>
						<Search size={13} />
					</Input.Label>
					<Input.Field
						placeholder="Search actions..."
						value={query}
						onChange={e => setQuery(e.target.value)}
						autoFocus
					/>
				</Input.Root>
			</div>

			<div className="flex flex-1 min-h-0">

				<nav className="w-44 shrink-0 flex flex-col gap-0.5 p-1.5 border-r border-line-subtle overflow-y-auto">

					<ComponentTab
						icon={<Layers size={12} />}
						label="All components"
						count={total}
						active={!selectedGroup}
						onClick={() => setSelected("all")}
					/>

					<div className="h-px bg-line-subtle my-1 mx-1.5" />

					{groups.map(({ component, actions }) => (
						<ComponentTab
							key={component.id}
							icon={isLogicComponent(component) ? <GitBranch size={12} /> : <Box size={12} />}
							label={component.alias}
							mono
							count={actions.length}
							active={selectedGroup?.component.id === component.id}
							onClick={() => setSelected(component.id)}
						/>
					))}

				</nav>

				<div className="flex-1 min-w-0 overflow-y-auto flex flex-col py-1">

					{visibleGroups.length === 0 && (
						<div className="flex flex-col items-center justify-center gap-2 h-full">
							<Zap size={20} className="text-fg-muted" />
							<Text variant="low" size="xs">
								{q ? "No actions match your search." : "No registered actions found."}
							</Text>
						</div>
					)}

					{visibleGroups.map(({ component, actions }) => (
						<div key={component.id} className="flex flex-col">

							{/* Cabeçalho só faz sentido quando mais de um componente está na lista. */}
							{!selectedGroup && (
								<div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
									<Text variant="low" size="xs" font="mono" className="truncate uppercase tracking-wide">{component.alias}</Text>
								</div>
							)}

							{actions.map(({ schema: action, trigger }, i) => (
								<div
									key={`${component.id}_${action.displayName}_${i}`}
									role="button"
									tabIndex={0}
									onClick={() => onSelect(component, action)}
									onKeyDown={e => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											onSelect(component, action);
										}
									}}
									className="group/row flex items-center gap-2.5 mx-1.5 px-2 py-1.5 rounded-md hover:bg-hover focus-visible:bg-hover transition-colors cursor-pointer outline-none"
								>
									{/* A trigger: round, accent — like its node, where the flow starts. */}
									<div className={clsx(
										"flex items-center justify-center size-6 shrink-0 transition-colors",
										trigger
											? "rounded-full bg-accent-subtle border border-accent-line text-accent-fg"
											: "rounded-md bg-field border border-line-subtle text-fg-muted group-hover/row:text-accent",
									)}>
										<ActionIcon icon={action.icon} size={12} fallback={isLogicComponent(component) ? <LogicIcon action={action.displayName} /> : trigger ? <Radio size={12} /> : <Zap size={12} />} />
									</div>
									<div className="flex flex-col min-w-0 flex-1">
										<div className="flex items-center gap-1.5 min-w-0">
											<Text variant="high" size="sm" className="truncate">{action.displayName}</Text>
											{trigger && <TriggerTag />}
										</div>
										{action.description && (
											<Text variant="low" size="xs" className="truncate">{action.description}</Text>
										)}
									</div>
									<ChevronRight size={14} className="shrink-0 text-fg-muted opacity-0 group-hover/row:opacity-100 transition-opacity" />
								</div>
							))}

						</div>
					))}

				</div>

			</div>

		</>

	);

};

type ComponentTabProps = {
	icon: React.ReactNode;
	label: string;
	count: number;
	active: boolean;
	mono?: boolean;
	onClick: () => void;
};

const ComponentTab: React.FC<ComponentTabProps> = ({ icon, label, count, active, mono, onClick }) => (
	<button
		type="button"
		onClick={onClick}
		className={clsx(
			"flex items-center gap-2 px-2 py-1.5 rounded-md text-left cursor-pointer transition-colors outline-none focus-visible:bg-hover",
			active ? "bg-selected text-fg" : "text-fg-secondary hover:bg-hover",
			count === 0 && !active && "opacity-50",
		)}
	>
		<span className={clsx("shrink-0", active ? "text-accent" : "text-fg-muted")}>{icon}</span>
		<span className={clsx("flex-1 min-w-0 truncate text-xs", mono && "font-mono")}>{label}</span>
		<span className="shrink-0 text-xs tabular-nums text-fg-muted">{count}</span>
	</button>
);
