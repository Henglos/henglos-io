import type { WorkflowFile } from "../entities/WorkflowFile";

/** The files attached to workflows' configs. */
export interface IWorkflowFileRepository {

	/** Stores it — or returns the workflow's file with the same content, if there's one already. */
	save(file: Omit<WorkflowFile, "id" | "createdAt">): Promise<WorkflowFile>;
	findById(workflowId: string, id: string): Promise<WorkflowFile | null>;
	findByWorkflow(workflowId: string): Promise<WorkflowFile[]>;

}
