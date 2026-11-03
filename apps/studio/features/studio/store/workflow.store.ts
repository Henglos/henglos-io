import { atom } from "jotai";
import type { WorkflowDetail } from "@shared/types/workflow.types";

export type WorkflowStatus = {
	synchronized: boolean;
	saved: boolean;
};

export const WorkflowAtom = atom<WorkflowDetail | null>(null);
export const WorkflowStatusAtom = atom<WorkflowStatus | undefined>(undefined);
export type WorkflowSavedCanvas = {
	start: WorkflowDetail["data"]["start"];
	components: WorkflowDetail["data"]["components"];
	connections: WorkflowDetail["data"]["connections"];
} | null;

export const WorkflowSavedCanvasAtom = atom<WorkflowSavedCanvas>(null);
