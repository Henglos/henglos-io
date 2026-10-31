import type { IWorkflowRuntime } from "@henglosio/workflow";
import { Workflow } from "../entities/Workflow";

/** One page of a user's workflows. */
export type WorkflowsSegment = {
	workflows: Workflow[];
	/** The next page's number — undefined on the last one. */
	nextSegment: number | undefined;
}

/** The users' workflows, and their collaborative state. */
export interface IWorkflowRepository {
	save(workflow: Workflow): Promise<Workflow>;

	findById(id: string): Promise<Workflow | null>;
	/**
	 * A page of a user's workflows.
	 *
	 * @param query Text to search their names for ("" for all).
	 * @param segment The page number.
	 * @param length How many per page.
	 */
	findPaginatedByUser(userId: string, query: string, segment: number, length: number): Promise<WorkflowsSegment>;
	findAllByUser(userId: string): Promise<Workflow[]>;
	existsById(id: string): Promise<boolean>;
	/** Whether the user already has a workflow with that name. */
	existsByName(userId: string, name: string): Promise<boolean>;
	countByUser(userId: string): Promise<number>;

	/** Whether any workflow uses the package. */
	isPackageInUse(packageId: string): Promise<boolean>;

	update(workflow: Workflow): Promise<void>;

	/** The collaborative doc's Yjs state, if it was ever edited together. */
	findCollabState(id: string): Promise<Uint8Array | null>;
	/** Persists the collaborative doc: its JSON projection (`data`) and its Yjs state, together. */
	saveCollabState(id: string, data: IWorkflowRuntime, state: Uint8Array): Promise<void>;
	delete(id: string): Promise<void>;
	deleteAllByUser(userId: string): Promise<void>;
}
