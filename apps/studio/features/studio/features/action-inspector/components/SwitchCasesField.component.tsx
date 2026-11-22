import { useState } from "react";
import { useAtomValue } from "jotai";
import { Button, Text } from "@henglosio/ui";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { caseNumber, CONFIGS_PER_SWITCH_CASE, MAX_SWITCH_CASES } from "@henglosio/workflow";
import type { IConfigurationRuntime } from "@henglosio/workflow";
import { BoardLimitsAtom } from "@/features/studio/store/platform.store";
import { isConfigVisible } from "@/features/studio/components/ActionNode/lib/isConfigVisible";

/** Whether `configuration` is one of a Switch case's — those show in SwitchCasesField, not in the plain list. */
export const isSwitchCaseConfig = (configuration: IConfigurationRuntime) => caseNumber(configuration.base.displayName) !== undefined;

// The drag's payload type — only a case of this list is dropped on it.
const DRAG_TYPE = "application/x-henglosio-switch-case";

type SwitchCasesFieldProps = {
	/** The action's configs (merged) — the cases' are picked out of them. */
	configurations: IConfigurationRuntime[];
	/** Renders one of a case's fields, compact (no label). */
	renderField: (configuration: IConfigurationRuntime) => React.ReactNode;
	onAdd: () => void;
	/** Removes Case `n` — the ones after it move up a number. */
	onRemove: (n: number) => void;
	/** Moves Case `from` to position `to`. */
	onMove: (from: number, to: number) => void;
};

type Case = { n: number; value?: IConfigurationRuntime; operation?: IConfigurationRuntime; compare?: IConfigurationRuntime };

/**
 * Switch's cases, n8n style: a group per case — Value, Operation and Compare
 * to side by side (Compare to only when the operation takes one) — dragged by
 * its grip to another position, removed with its trash button; one more at
 * the end. Past what a board wires per action (MAX_OUTPUTS_PER_ACTION, Default
 * included) or takes per command (MAX_CONFIGS_PER_COMMAND) it says which
 * setting to raise.
 *
 * The reorder drag is the browser's own, not dnd-kit: the fields inside stay
 * drop targets of the studio's bind drag (bindDrag's DndContext), which a
 * nested DndContext would take over.
 */
export const SwitchCasesField: React.FC<SwitchCasesFieldProps> = ({ configurations, renderField, onAdd, onRemove, onMove }) => {

	const { protocol } = useAtomValue(BoardLimitsAtom);

	const cases = new Map<number, Case>();
	for (const configuration of configurations) {
		const n = caseNumber(configuration.base.displayName);
		if (n === undefined) continue;
		const entry = cases.get(n) ?? { n };
		const role = configuration.base.displayName.slice(`Case ${n} `.length);
		if (role === "value") entry.value = configuration;
		else if (role === "operation") entry.operation = configuration;
		else if (isConfigVisible(configuration, configurations)) entry.compare = configuration;
		cases.set(n, entry);
	}
	const list = [...cases.values()].sort((a, b) => a.n - b.n);
	const count = list.length;

	// Every case and Default, if each is wired; every case's configs, each sent, and Pass Context's flag.
	const outputs = count + 1;
	const configs = count * CONFIGS_PER_SWITCH_CASE + 1;

	// The case being dragged (armed by its grip), and the one it's over.
	const [armed, setArmed] = useState<number | null>(null);
	const [dragging, setDragging] = useState<number | null>(null);
	const [over, setOver] = useState<number | null>(null);

	const endDrag = () => { setArmed(null); setDragging(null); setOver(null); };

	return (
		<div className="flex flex-col gap-2 nodrag">

			{list.map(({ n, value, operation, compare }) => (
				<div
					key={n}
					draggable={armed === n}
					onDragStart={e => {
						e.dataTransfer.setData(DRAG_TYPE, String(n));
						e.dataTransfer.effectAllowed = "move";
						setDragging(n);
					}}
					onDragOver={e => {
						if (dragging === null || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
						e.preventDefault();
						e.dataTransfer.dropEffect = "move";
						if (over !== n) setOver(n);
					}}
					onDrop={e => {
						e.preventDefault();
						const from = Number(e.dataTransfer.getData(DRAG_TYPE));
						if (from && from !== n) onMove(from, n);
						endDrag();
					}}
					onDragEnd={endDrag}
					className={clsx(
						"flex flex-col gap-2 rounded-md border bg-field/40 p-2 transition-[border-color,opacity]",
						over === n && dragging !== n ? "border-accent" : "border-line-subtle",
						dragging === n && "opacity-50",
					)}
				>
					<div className="flex items-center gap-1.5">
						<span
							onPointerDown={() => setArmed(n)}
							onPointerUp={() => dragging === null && setArmed(null)}
							className="flex items-center justify-center size-4 rounded-sm cursor-grab active:cursor-grabbing text-fg-muted hover:text-fg hover:bg-hover"
							title="Drag to reorder — the first case that holds wins"
						>
							<GripVertical size={12} />
						</span>
						<Text variant="dim" size="xs" font="mono" className="flex-1">Case {n}</Text>
						<button
							type="button"
							onClick={() => onRemove(n)}
							disabled={count <= 1}
							className="flex items-center justify-center size-5 rounded-sm cursor-pointer text-fg-muted hover:text-danger hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
							title={count <= 1 ? "A Switch keeps one case at least" : `Remove Case ${n} — and the wires leaving it${n < count ? `; Case ${n + 1}… move up a number` : ""}`}
						>
							<Trash2 size={12} />
						</button>
					</div>

					{/* Stacked, each at a comfortable width — not stretched across the card. */}
					<div className="flex flex-col gap-1.5">
						{value && <div className="w-full max-w-64">{renderField(value)}</div>}
						{operation && <div className="w-full max-w-52">{renderField(operation)}</div>}
						{compare && <div className="w-full max-w-64">{renderField(compare)}</div>}
					</div>
				</div>
			))}

			<Button.Root variant="surface" size="sm" onClick={onAdd} disabled={count >= MAX_SWITCH_CASES} title={count >= MAX_SWITCH_CASES ? `At most ${MAX_SWITCH_CASES} cases` : `Add Case ${count + 1}`} className="self-start">
				<Button.Icon><Plus size={12} /></Button.Icon>
				<Button.Label>Add case</Button.Label>
			</Button.Root>

			{outputs > protocol.maxOutputs && (
				<Text variant="low" size="xs">
					The board wires {protocol.maxOutputs} outputs per action — raise MAX_OUTPUTS_PER_ACTION in Platform settings (then Compile + Flash) to wire all {outputs}.
				</Text>
			)}
			{configs > protocol.maxConfigs && (
				<Text variant="low" size="xs">
					Each case sends up to {CONFIGS_PER_SWITCH_CASE} configs and the board takes {protocol.maxConfigs} per command — raise MAX_CONFIGS_PER_COMMAND in Platform settings (then Compile + Flash) to send all {configs}.
				</Text>
			)}

		</div>
	);

};
