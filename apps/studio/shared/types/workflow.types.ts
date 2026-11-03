import type { IWorkflowRuntime } from "@henglosio/workflow";
import type { Workflow } from "@henglosio/shared";

export type WorkflowDetail = Workflow & {
	data: IWorkflowRuntime;
	platform: string;
	/** Its board's version was removed with no other to move it to — see FullWorkflowSchema. */
	boardMissing?: boolean;
};
