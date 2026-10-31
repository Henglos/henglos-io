import type { DragEvent } from "react";

// Drag-to-bind: an action's output, or a workflow variable, dropped onto a
// configuration binds the configuration to it. HTML5 DnD: the payload is only
// readable on "drop", but `types` is during "dragover" — enough to tell what's
// coming.

export const OUTPUT_DRAG_MIME = "application/x-henglos-output";
/** The drag type of a workflow variable dragged onto a field. */
export const VARIABLE_DRAG_MIME = "application/x-henglos-variable";

/** An action's output being dragged onto a field, to bind it. */
export type OutputDragPayload = {
	actionId: string;
	outputName: string;
};

/** The output a drop carries — null when it carries none. */
export const unpackOutputDragPayload = (event: DragEvent): OutputDragPayload | null => {
	const raw = event.dataTransfer.getData(OUTPUT_DRAG_MIME);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as OutputDragPayload;
	} catch {
		return null;
	}
};

/** Whether a drag carries a variable — readable during dragover, unlike the payload. */
export const isVariableDrag = (event: DragEvent) => event.dataTransfer.types.includes(VARIABLE_DRAG_MIME);

/** The variable id a drop carries — null when it carries none. */
export const unpackVariableDragPayload = (event: DragEvent): string | null =>
	event.dataTransfer.getData(VARIABLE_DRAG_MIME) || null;
