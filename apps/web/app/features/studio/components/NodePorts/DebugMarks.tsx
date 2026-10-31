import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useReactFlow } from "@xyflow/react";
import { CircleCheck, Loader2, Radio, StepForward, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { DebugSessionAtom } from "@/features/studio/store/debug.store";
import { useDebugger } from "@/features/studio/hooks/useDebugger";

// Debug mode on the canvas: where the flow is. The node that just ran is
// solid (step and the output it ended on), the one Continue runs next is
// dashed with the Continue button on it, the wire between them flows, and
// everything else steps back. Debugging from a trigger, the trigger is marked
// "listening" while the session waits for it to fire.

export type DebugMark = {
	/** "ran": the step that just ran. "next": what Continue runs. "both": a loop onto itself. "listening": the trigger the session waits for. */
	role: "ran" | "next" | "both" | "listening" | null;
	/** A debug session is open — unmarked nodes are dimmed. */
	debugging: boolean;
};

export function useDebugMark(id: string): DebugMark {
	const session = useAtomValue(DebugSessionAtom);
	if (!session) return { role: null, debugging: false };
	if (session.state.status === "listening" && session.entryId === id) return { role: "listening", debugging: true };
	const ran = session.state.ran?.actionId === id;
	const next = session.state.status === "paused" && session.state.nextActionId === id;
	return { role: ran && next ? "both" : ran ? "ran" : next ? "next" : null, debugging: true };
}

/** The card's border for a debug mark — falls back to the selection look. */
export const debugCardClass = (mark: DebugMark, selected: boolean | undefined) =>
	mark.role === "next" || mark.role === "listening" ? "border-accent border-dashed ring-2 ring-accent-subtle"
	: mark.role === "ran" || mark.role === "both" ? "border-accent ring-2 ring-accent-subtle shadow-[0_0_24px_var(--accent-subtle)]"
	: selected ? "border-accent-line ring-1 ring-accent-line"
	: "border-line-subtle";

/** The node's root: unmarked nodes fade back while debugging. */
export const debugRootClass = (mark: DebugMark) =>
	clsx("transition-opacity duration-200", mark.debugging && !mark.role && "opacity-45 hover:opacity-100");

/** The tags over a marked node: what it did, and the Continue button. */
export const DebugBadges: React.FC<{ mark: DebugMark }> = ({ mark }) => {

	const debug = useDebugger();
	const session = debug.session;
	if (!session || !mark.role) return null;

	const { ran, step } = session.state;
	const showRan = (mark.role === "ran" || mark.role === "both") && ran;
	const showNext = mark.role === "next" || mark.role === "both";
	const fallback = ran?.output.name === "Fallback";

	return (
		<div className="absolute bottom-full left-0 mb-1.5 flex items-center gap-1.5 nodrag nopan">

			{mark.role === "listening" && (
				<div className="flex items-center gap-1 px-1.5 h-6 rounded-md text-xs font-medium border pointer-events-none bg-accent-subtle border-accent-line text-accent-fg">
					<Radio size={11} className="animate-pulse" />
					Listening…
				</div>
			)}

			{showRan && (
				<div className={clsx(
					"flex items-center gap-1 px-1.5 h-6 rounded-md text-xs font-medium border pointer-events-none",
					fallback ? "bg-danger-subtle border-danger-line text-danger" : "bg-accent-subtle border-accent-line text-accent-fg",
				)}>
					{fallback ? <TriangleAlert size={11} /> : <CircleCheck size={11} />}
					<span className="tabular-nums">Step {step}</span>
					<span className="opacity-70">→</span>
					<span className="font-mono">{ran.output.name}</span>
				</div>
			)}

			{showNext && (
				<button
					type="button"
					onClick={e => { e.stopPropagation(); void debug.next(); }}
					disabled={session.busy}
					title="Run this action and pause again"
					className="flex items-center gap-1 px-2 h-6 rounded-md text-xs font-medium cursor-pointer bg-accent text-on-accent shadow-[0_2px_10px_rgb(0_0_0/0.35)] transition-colors hover:bg-accent-hover disabled:cursor-progress disabled:opacity-80"
				>
					{session.busy ? <Loader2 size={11} className="animate-spin" /> : <StepForward size={11} />}
					{session.busy ? "Running…" : <>Continue <span className="opacity-70 tabular-nums">· step {step + 1}</span></>}
				</button>
			)}

		</div>
	);

};

/** Keeps the step in view: frames the node that ran and the next one on every step. */
export const DebugFollow = () => {

	const session = useAtomValue(DebugSessionAtom);
	const { fitView, getZoom } = useReactFlow();
	const ranId = session?.state.ran?.actionId;
	const nextId = session?.state.status === "paused" ? session.state.nextActionId
		: session?.state.status === "listening" ? session.entryId
		: null;
	const step = session?.state.step;

	useEffect(() => {
		const ids = [...new Set([ranId, nextId].filter((value): value is string => !!value))];
		if (ids.length === 0) return;
		// Never zooms in past where the user is — only pans (or zooms out to fit both).
		void fitView({ nodes: ids.map(id => ({ id })), duration: 350, padding: 0.4, maxZoom: getZoom() });
	}, [step, ranId, nextId]);

	return null;

};
