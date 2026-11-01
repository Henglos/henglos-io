import { useAtomValue } from "jotai";
import { Button, Text } from "@henglosio/ui";
import { Plus, X } from "lucide-react";
import { MAX_SWITCH_CASES } from "@henglosio/workflow";
import { BoardLimitsAtom } from "@/features/studio/store/platform.store";

type SwitchCasesFieldProps = {
	count: number;
	onAdd: () => void;
	/** Removes Case `n` — the ones after it move up a number. */
	onRemove: (n: number) => void;
};

/**
 * Switch's cases: one more (a Case N config and its output, before Default),
 * or any of them less — each with its ×. Past what a board wires per action
 * (its MAX_OUTPUTS_PER_ACTION, Default included) it says which setting to raise.
 */
export const SwitchCasesField: React.FC<SwitchCasesFieldProps> = ({ count, onAdd, onRemove }) => {

	const { protocol } = useAtomValue(BoardLimitsAtom);
	// Every case and Default, if each is wired.
	const outputs = count + 1;
	const cases = Array.from({ length: count }, (_, i) => i + 1);

	return (
		<div className="flex flex-col gap-1.5 nodrag">
			<div className="flex items-center gap-2">
				<Text variant="dim" size="xs" className="flex-1">{count} {count === 1 ? "case" : "cases"}</Text>
				<Button.Root variant="surface" size="sm" onClick={onAdd} disabled={count >= MAX_SWITCH_CASES} title={count >= MAX_SWITCH_CASES ? `At most ${MAX_SWITCH_CASES} cases` : `Add Case ${count + 1}`}>
					<Button.Icon><Plus size={12} /></Button.Icon>
					<Button.Label>Add case</Button.Label>
				</Button.Root>
			</div>
			<div className="flex flex-wrap gap-1">
				{cases.map(n => (
					<span key={n} className="inline-flex items-center gap-1 h-5 pl-2 pr-1 rounded-sm border border-line-subtle bg-field">
						<Text variant="dim" size="xs" font="mono">Case {n}</Text>
						<button
							type="button"
							onClick={() => onRemove(n)}
							disabled={count <= 1}
							className="flex items-center justify-center size-3.5 rounded-sm cursor-pointer text-fg-muted hover:text-danger hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
							title={count <= 1 ? "A Switch keeps one case at least" : `Remove Case ${n} — and the wires leaving it${n < count ? `; Case ${n + 1}… move up a number` : ""}`}
						>
							<X size={10} />
						</button>
					</span>
				))}
			</div>
			{outputs > protocol.maxOutputs && (
				<Text variant="low" size="xs">
					The board wires {protocol.maxOutputs} outputs per action — raise MAX_OUTPUTS_PER_ACTION in Platform settings (then Compile + Flash) to wire all {outputs}.
				</Text>
			)}
		</div>
	);

};
