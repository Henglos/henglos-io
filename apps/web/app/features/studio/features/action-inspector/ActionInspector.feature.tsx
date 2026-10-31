import { useState } from "react";
import { Tabs, Text, Textarea } from "@henglosio/ui";
import type { IActionRuntime, IComponentRuntime } from "@henglosio/workflow";
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";

import { useSelectedAction } from "@/features/studio/hooks/useSelectedAction";
import { useInspector } from "./useInspector";
import { InspectorHeader } from "./components/InspectorHeader.component";
import { UpstreamData } from "./components/UpstreamData.component";
import { ActionOutputs } from "./components/ActionOutputs.component";
import { Fold } from "./components/Fold.component";

// The inspector in the right sidebar (NODE_LAYOUT "sidebar"), laid out the
// way data goes through the action:
//   Settings — how it runs: its configs (advanced ones folded away), with the
//              data of the actions before it right there to drag onto them;
//   Output   — what it hands the next actions, and what its last run published;
//   Notes.
// The bottom panel's (InspectorPanel) shows the same in three columns.

type InspectorTab = "settings" | "output" | "notes";

export const ActionInspector = () => {

	const { component, action } = useSelectedAction();
	if (!component || !action) return null;

	// Keyed: another action starts from its own tab and notes draft.
	return <SidebarInspector key={action.id} component={component} action={action} />;

};

const SidebarInspector: React.FC<{ component: IComponentRuntime; action: IActionRuntime }> = ({ component, action }) => {

	const inspector = useInspector(component, action);
	const { basic, advanced, advancedCount, renderFields, renderPassContext, renderSwitchCases, upstream, shown, notes } = inspector;
	const [tab, setTab] = useState<InspectorTab>("settings");

	// A new result (a ▶, a debug step) brings its values into view — adjusted
	// while rendering, the moment ranAt changes (not on opening the inspector).
	const ranAt = shown?.ranAt.getTime();
	const [seenRanAt, setSeenRanAt] = useState(ranAt);
	if (ranAt !== seenRanAt) {
		setSeenRanAt(ranAt);
		if (ranAt) setTab("output");
	}

	return (

		<div className="flex flex-col h-full min-h-0">

			<InspectorHeader inspector={inspector} onShowOutput={() => setTab("output")} />

			<Tabs.Root value={tab} onValueChange={value => setTab(value as InspectorTab)} className="flex flex-col flex-1 min-h-0">

				<Tabs.List className="gap-4 px-3 shrink-0 border-line-subtle">
					<Tabs.Tab value="settings" className="pb-2">Settings</Tabs.Tab>
					<Tabs.Tab value="output" className="pb-2">Output{shown ? " •" : ""}</Tabs.Tab>
					<Tabs.Tab value="notes" className="pb-2">Notes{notes ? " •" : ""}</Tabs.Tab>
				</Tabs.List>

				{/* Settings: how it runs — and, right under, the data it can be fed from. */}
				<Tabs.Panel value="settings" className="flex-1 min-h-0 overflow-y-auto">
					<Block icon={SlidersHorizontal} title="Settings" hint="Set a value, or drag data onto a field — from Input, the canvas, or a variable">
						{basic.length > 0 ? renderFields(basic) : <Text variant="low" size="xs">No settings.</Text>}
						{renderSwitchCases()}
						{advancedCount > 0 && <Fold title={`Advanced (${advancedCount})`}>{renderFields(advanced)}{renderPassContext()}</Fold>}
					</Block>
					<Block
						icon={ArrowDownToLine}
						title={`Input${upstream.length ? ` · ${upstream.length}` : ""}`}
						hint="Data from earlier actions — drag it onto a setting"
						foldable
						defaultOpen={upstream.length > 0}
					>
						<UpstreamData upstream={upstream} withValues />
					</Block>
				</Tabs.Panel>

				{/* Output: what it hands on — each output with what the last run put in it. */}
				<Tabs.Panel value="output" className="flex-1 min-h-0 overflow-y-auto">
					<Block icon={ArrowUpFromLine} title="Output" hint="What it hands the next actions — drag it into the code editor">
						<ActionOutputs inspector={inspector} />
					</Block>
				</Tabs.Panel>

				<Tabs.Panel value="notes" className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
					<Textarea.Root value={notes}>
						<Textarea.Field
							rows={8}
							value={notes}
							onChange={e => inspector.onNotesChange(e.target.value)}
							onBlur={inspector.flushNotes}
							placeholder="Write a note about this action..."
						/>
					</Textarea.Root>
				</Tabs.Panel>

			</Tabs.Root>

		</div>

	);

};

type BlockProps = {
	icon: React.ComponentType<{ size?: number; className?: string }>;
	title: string;
	hint: string;
	foldable?: boolean;
	defaultOpen?: boolean;
	children: React.ReactNode;
};

// One part of a tab: an icon and title saying what it is, a line saying what
// to do with it, then its content — foldable for the optional ones.
const Block: React.FC<BlockProps> = ({ icon: Icon, title, hint, foldable, defaultOpen = true, children }) => {
	const [open, setOpen] = useState(defaultOpen);
	const shown = !foldable || open;
	const Chevron = open ? ChevronDown : ChevronRight;
	const heading = (
		<>
			<Icon size={13} className="shrink-0 text-fg-muted" />
			<Text variant="dim" size="xs" className="font-medium">{title}</Text>
			{foldable && <Chevron size={12} className="ml-auto text-fg-muted" />}
		</>
	);
	return (
		<section className="flex flex-col gap-3 px-4 py-4 border-b border-line-subtle">
			{foldable
				? <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 cursor-pointer text-left" title={hint}>{heading}</button>
				: <div className="flex items-center gap-2" title={hint}>{heading}</div>}
			{shown && <div className="flex flex-col gap-4">{children}</div>}
		</section>
	);
};
