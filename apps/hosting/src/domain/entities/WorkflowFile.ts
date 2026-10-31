// A file attached to a workflow's config (`type: file`) — its bytes, and what
// the studio shows of it. Identified by `id`; `sha256` is what the board
// keeps it under (fileBoardPath in @henglosio/workflow).
export type WorkflowFile = {
	id: string;
	workflowId: string;
	name: string;
	mime: string;
	size: number;
	sha256: string;
	data: Buffer;
	createdAt: Date;
};

/** At most this many bytes per file — they live in the database and travel to the board in a session's start. */
export const WORKFLOW_FILE_MAX_BYTES = 64 * 1024;
