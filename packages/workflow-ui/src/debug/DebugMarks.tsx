import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { CircleCheck, StepForward, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import type { DebugSimulationState } from "./simulation";

// Debug mode on the canvas, as in the studio: the node that just ran is solid
// (its step and the output it ended on), the one that runs next is dashed with
// Continue on it, the wire between them flows, everything else steps back.

export type DebugRole = "ran" | "next" | "both" | null;

/** `id`'s part in the session: what ran, what's next, both (a loop onto itself), or nothing. */
export function debugRole(debug: DebugSimulationState | null | undefined, id: string): DebugRole {
	if (!debug || debug.status === "idle") return null;
	const ran = debug.ranId === id;
	const next = debug.status === "paused" && debug.nextId === id;
	return ran && next ? "both" : ran ? "ran" : next ? "next" : null;
}

/** The card's border for a role — undefined: the app's (or the selection) look. */
export const debugCardClass = (role: DebugRole): string | undefined =>
	role === "next" ? "border-accent border-dashed ring-2 ring-accent-subtle"
	: role === "ran" || role === "both" ? "border-accent ring-2 ring-accent-subtle shadow-[0_0_24px_var(--accent-subtle)]"
	: undefined;

/** The node's root: unmarked nodes fade back while debugging. */
export const debugRootClass = (debugging: boolean, role: DebugRole) =>
	clsx("transition-opacity duration-200", debugging && !role && "opacity-45 hover:opacity-100");

type DebugBadgesProps = {
	role: DebugRole;
	debug: DebugSimulationState;
	/** Continue on the next node — absent: no button. */
	onContinue?: () => void;
};

/** The tags over a marked node: what it did, and Continue. */
export const DebugBadges: React.FC<DebugBadgesProps> = ({ role, debug, onContinue }) => {

	if (!role) return null;
	const showRan = (role === "ran" || role === "both") && debug.ranOutput !== null;
	const showNext = (role === "next" || role === "both") && !!onContinue;
	const fallback = debug.ranOutput === "Fallback";

	return (
		<div className="absolute bottom-full left-0 mb-1.5 flex items-center gap-1.5 nodrag nopan">

			{showRan && (
				<div className={clsx(
					"flex items-center gap-1 px-1.5 h-6 rounded-md text-xs font-medium border pointer-events-none",
					fallback ? "bg-danger-subtle border-danger-line text-danger" : "bg-accent-subtle border-accent-line text-accent-fg",
				)}>
					{fallback ? <TriangleAlert size={11} /> : <CircleCheck size={11} />}
					<span className="tabular-nums">Step {debug.step}</span>
					<span className="opacity-70">→</span>
					<span className="font-mono">{debug.ranOutput}</span>
				</div>
			)}

			{showNext && (
				<button
					type="button"
					onClick={e => { e.stopPropagation(); onContinue!(); }}
					title="Run this action and pause again"
					className="flex items-center gap-1 px-2 h-6 rounded-md text-xs font-medium cursor-pointer bg-accent text-on-accent shadow-[0_2px_10px_rgb(0_0_0/0.35)] transition-colors hover:bg-accent-hover"
				>
					<StepForward size={11} />
					Continue <span className="opacity-70 tabular-nums">· step {debug.step + 1}</span>
				</button>
			)}

		</div>
	);

};

/** Keeps the step in view: frames the node that ran and the next one on every step. */
export const DebugFollow: React.FC<{ debug: DebugSimulationState | null | undefined }> = ({ debug }) => {

	const { fitView, getZoom } = useReactFlow();
	const ranId = debug?.ranId;
	const nextId = debug?.status === "paused" ? debug.nextId : null;
	const step = debug?.step;

	useEffect(() => {
		const ids = [...new Set([ranId, nextId].filter((value): value is string => !!value))];
		if (ids.length === 0) return;
		// Never zooms in past where the viewer is — only pans (or zooms out to fit both).
		void fitView({ nodes: ids.map(id => ({ id })), duration: 350, padding: 0.4, maxZoom: getZoom() });
	}, [step, ranId, nextId]);

	return null;

};
