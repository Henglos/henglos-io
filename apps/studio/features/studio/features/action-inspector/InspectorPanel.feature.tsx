import { useState } from "react";
import { Text, Textarea } from "@henglosio/ui";
import type { IActionRuntime, IComponentRuntime } from "@henglosio/workflow";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

import { useSelectedAction } from "@/features/studio/hooks/useSelectedAction";
import { useInspector } from "./useInspector";
import { InspectorHeader } from "./components/InspectorHeader.component";
import { UpstreamData } from "./components/UpstreamData.component";
import { ActionOutputs } from "./components/ActionOutputs.component";
import { Fold } from "./components/Fold.component";
import { ResizeHandle, useResizable } from "@/features/studio/components/ResizeHandle/ResizeHandle.component";

// The side columns' widths — each dragged by the edge it shares with Settings, kept in this browser.
const SIDE_WIDTH = { initial: 300, min: 160, max: 640 };

// The inspector in the bottom panel (NODE_LAYOUT "panel"), n8n-style: the
// way data goes through the action, left to right, with the canvas still in
// view above —
//   Input    — what the actions before it hand out (and held, last run):
//              dragged onto a setting to use it;
//   Settings — the action itself: how it runs, its notes;
//   Output   — what it hands on, with what its last run published.

export const InspectorPanel = () => {

	const { component, action, count } = useSelectedAction();

	if (!component || !action) {
		return (
			<div className="flex items-center justify-center h-full">
				<Text variant="low" size="sm">{count > 1 ? "Select a single action." : "Select an action."}</Text>
			</div>
		);
	}

	// Keyed: another action starts with its own notes draft.
	return <Columns key={action.id} component={component} action={action} />;

};

const Columns: React.FC<{ component: IComponentRuntime; action: IActionRuntime }> = ({ component, action }) => {

	const inspector = useInspector(component, action);
	const { basic, advanced, advancedCount, renderFields, renderPassContext, upstream, notes } = inspector;
	const [notesOpen, setNotesOpen] = useState(false);
	const input = useResizable({ storageKey: "studio.inspector.inputWidth", ...SIDE_WIDTH });
	const output = useResizable({ storageKey: "studio.inspector.outputWidth", ...SIDE_WIDTH });

	return (

		<div className="flex h-full min-h-0">

			<Column icon={ArrowDownToLine} title="Input" hint="Data from earlier actions — drag it onto a setting" count={upstream.length} width={input.size}
				handle={<ResizeHandle edge="right" size={input.size} onResize={(width, done) => input.setSize(width, done)} />}>
				<UpstreamData upstream={upstream} withValues />
			</Column>

			<div className="flex flex-col flex-1 min-w-48 min-h-0 border-x border-line bg-raised">
				<InspectorHeader inspector={inspector} notesOpen={notesOpen} onToggleNotes={() => setNotesOpen(!notesOpen)} />
				<div className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto px-5 py-4">
					{basic.length > 0 ? renderFields(basic) : <Text variant="low" size="xs">No settings.</Text>}
					{advancedCount > 0 && <Fold title={`Advanced (${advancedCount})`}>{renderFields(advanced)}{renderPassContext()}</Fold>}
					{(notesOpen || notes) && (
						<div className="flex flex-col gap-1.5 pt-3 border-t border-line-subtle">
							<Text variant="dim" size="xs">Notes</Text>
							<Textarea.Root value={notes}>
								<Textarea.Field
									rows={3}
									value={notes}
									onChange={e => inspector.onNotesChange(e.target.value)}
									onBlur={inspector.flushNotes}
									placeholder="Write a note about this action..."
								/>
							</Textarea.Root>
						</div>
					)}
				</div>
			</div>

			<Column icon={ArrowUpFromLine} title="Output" hint="What it hands the next actions — drag it into the code editor" width={output.size}
				handle={<ResizeHandle edge="left" size={output.size} onResize={(width, done) => output.setSize(width, done)} />}>
				<ActionOutputs inspector={inspector} />
			</Column>

		</div>

	);

};

type ColumnProps = {
	icon: React.ComponentType<{ size?: number; className?: string }>;
	title: string;
	hint: string;
	count?: number;
	/** Its width (px). */
	width: number;
	/** What resizes it, on the edge it shares with Settings. */
	handle?: React.ReactNode;
	children: React.ReactNode;
};

// A side column: its name (what it's for on hover), its content scrolling on its own.
const Column: React.FC<ColumnProps> = ({ icon: Icon, title, hint, count, width, handle, children }) => (
	<div className="relative flex flex-col min-h-0 min-w-0 shrink-0" style={{ width }}>
		{handle}
		<div className="flex items-center gap-2 h-9 px-4 shrink-0 border-b border-line-subtle" title={hint}>
			<Icon size={13} className="text-fg-muted" />
			<Text variant="dim" size="xs" className="font-medium">{title}</Text>
			{!!count && <Text variant="low" size="xs">{count}</Text>}
		</div>
		<div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto p-4">
			{children}
		</div>
	</div>
);
