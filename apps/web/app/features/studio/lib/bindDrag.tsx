import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { atom, useAtom, useAtomValue } from "jotai";
import { Variable } from "lucide-react";

// Drag-to-bind: an action's output (its row in the node) or a workflow variable
// (the Variables list) dropped onto a config binds the config to it; a field of
// a list / object output makes the config a Code binding that reads it, and
// any of them dropped in the code editor writes what reads it there. One
// DndContext around the sidebar and the canvas, so a drag crosses from one to
// the other; each config is a drop target that says, while something hovers
// it, whether it takes it.

export type BindDrag =
	| { kind: "output"; actionId: string; outputName: string }
	| { kind: "variable"; variableId: string; name: string }
	// A field inside a list / object output — `path` walks into it: an index
	// for a list, a name for an object ("networks" [0, "ssid"]).
	| { kind: "field"; actionId: string; outputName: string; path: (string | number)[] };

/** What's being dragged to bind, or null outside a drag. */
export const BindDragAtom = atom<BindDrag | null>(null);

/** Where the pointer let go, in client coordinates. */
export type DropPoint = { x: number; y: number };

type BindTarget = {
	/** Whether this target takes the drag: "ok", "deny", or null when it doesn't care. */
	accepts: (drag: BindDrag) => "ok" | "deny" | null;
	/** The drop — only called when `accepts` said "ok". */
	onDrop: (drag: BindDrag, point: DropPoint | null) => void;
};

const pathSuffix = (path: (string | number)[], index: (step: number) => string, field: (step: string) => string) =>
	path.map(step => typeof step === "number" ? index(step) : field(step)).join("");

const dragLabel = (drag: BindDrag) =>
	drag.kind === "variable" ? drag.name
	: drag.kind === "output" ? drag.outputName
	: drag.outputName + pathSuffix(drag.path, step => `[${step}]`, step => `.${step}`);

/**
 * What a script reads for the drag — `ctx.get("networks")[0]["ssid"]`. Outputs
 * are published without a prefix and read lowercased (codeContextNames.ts);
 * variables through ctx.var().
 */
export const dragExpression = (drag: BindDrag): string =>
	drag.kind === "variable" ? `ctx.var(${JSON.stringify(drag.name)})`
	: `ctx.get(${JSON.stringify(drag.outputName.toLowerCase())})`
		+ (drag.kind === "field" ? pathSuffix(drag.path, step => `[${step}]`, step => `[${JSON.stringify(step)}]`) : "");

export const BindDragProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

	const [drag, setDrag] = useAtom(BindDragAtom);
	// A few pixels before it's a drag — a click on the row stays a click.
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

	const onDragStart = (event: DragStartEvent) => setDrag(event.active.data.current as BindDrag);

	const onDragEnd = (event: DragEndEvent) => {
		setDrag(null);
		const dragged = event.active.data.current as BindDrag | undefined;
		const target = event.over?.data.current as BindTarget | undefined;
		if (!dragged || !target) return;
		const start = event.activatorEvent;
		const point = start instanceof PointerEvent || start instanceof MouseEvent
			? { x: start.clientX + event.delta.x, y: start.clientY + event.delta.y }
			: null;
		if (target.accepts(dragged) === "ok") target.onDrop(dragged, point);
	};

	return (
		<DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
			{children}
			<DragOverlay dropAnimation={null}>
				{drag && (
					<div className="inline-flex items-center gap-1 px-2 h-6 rounded-md border border-accent-line bg-raised shadow-lg font-mono text-xs text-fg cursor-grabbing whitespace-nowrap">
						{drag.kind === "variable" && <Variable size={11} className="text-accent-fg" />}
						{dragLabel(drag)}
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);

};

/** Makes an element the handle that drags `drag` — spread `bind` on it. */
export const useBindDraggable = (id: string, drag: BindDrag) => {
	const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, data: drag });
	return { bind: { ref: setNodeRef, ...listeners, ...attributes }, isDragging };
};

/**
 * Makes an element a drop target — pass `setNodeRef` as its ref. `state` is what's over it
 * right now: "ok", "deny", or null.
 */
export const useBindDroppable = (id: string, target: BindTarget) => {
	// dnd-kit keeps the latest `data` — the drop reads this render's callbacks.
	const { setNodeRef, isOver } = useDroppable({ id, data: target });
	const drag = useAtomValue(BindDragAtom);
	const state = isOver && drag ? target.accepts(drag) : null;
	return { setNodeRef, state };
};
