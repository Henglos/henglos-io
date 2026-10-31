import zod from "zod";
import { PackageDTOSchema } from "./entities.js";

/** Hosting -> driver (`workflow:create`): a new workflow, and the packages it needs. */
export const DriverCreateWorkflowInDTOSchema = zod.object({

	id: zod.string(),
	workflowId: zod.string(),
	packages: PackageDTOSchema.array()

});

/** Driver -> hosting: whether it has the workflow, with its packages. */
export const DriverCreateWorkflowOutDTOSchema = zod.object({

	synced: zod.boolean(),

});

/** Hosting -> driver (`workflow:delete`): drop a workflow. */
export const DriverDeleteWorkflowInDTOSchema = zod.object({

	id: zod.string(),
	workflowId: zod.string(),

});

/** Driver -> hosting: whether there was one to drop. */
export const DriverDeleteWorkflowOutDTOSchema = zod.object({

	deleted: zod.boolean()

});

/** Hosting -> driver: bring one workflow's packages up to date. */
export const DriverSyncWorkflowInDTOSchema = zod.object({

	id: zod.string(),
	workflowId: zod.string(),

	packages: PackageDTOSchema.array()

});

/**
 * Hosting -> driver (`workflows:sync`): every workflow of the user, with its packages —
 * the driver drops the others.
 */
export const DriverSyncWorkflowsInDTOSchema = zod.object({

	id: zod.string(),

	workflows: zod.object({

		workflowId: zod.string(),
		packages: PackageDTOSchema.array()

	}).array()

});

// ── workflow:execute session protocol ───────────────────────────────────────────
// A workflow execution is a multi round-trip session, not a single fire-and-forget
// frame: there's no on-device graph storage (see docs/design-decisions.md), so
// hosting walks the graph itself — it sends one Execute frame, waits for the
// device's RESPONSE (relayed back verbatim by the driver), decides the next node
// from the RESPONSE's outputId, and repeats via DriverExecuteFrameInDTO until the
// graph has no next node, then closes the session with DriverExecuteFinishInDTO.
// The driver never assembles frames or interprets the graph — it only keeps the
// serial port open for the session's duration and relays raw frame bytes both ways.

// hosting -> driver: push the next frame to write within an already-open session.
export const DriverExecuteFrameInDTOSchema = zod.object({

	id: zod.string(),
	frame: zod.instanceof(Uint8Array),

});

// hosting -> driver: graph traversal is done (or failed) — close the serial port.
export const DriverExecuteFinishInDTOSchema = zod.object({

	id: zod.string(),

});

// ── workflow:record ──────────────────────────────────────────────────────────
// RECORD doesn't branch on the board's answers: hosting resolves the whole frame
// sequence up front (buildRecordProgram) and sends it as a `record` task
// (TaskRecordPayload) — see task.ts.

/** Hosting -> driver: remove a package version from the driver's cache. */
export const DriverRemovePackageInDTOSchema = zod.object({

	id: zod.string(),
	name: zod.string(),
	version: zod.string(),

});

/** Driver -> hosting: whether it was there to remove. */
export const DriverRemovePackageOutDTOSchema = zod.object({

	removed: zod.boolean()

});

/** Hosting -> driver (`workflow:create`): a new workflow, and the packages it needs. */
export type DriverCreateWorkflowInDTO = zod.infer<typeof DriverCreateWorkflowInDTOSchema>;
/** Driver -> hosting: whether it has the workflow, with its packages. */
export type DriverCreateWorkflowOutDTO = zod.infer<typeof DriverCreateWorkflowOutDTOSchema>;

/** Hosting -> driver (`workflow:delete`): drop a workflow. */
export type DriverDeleteWorkflowInDTO = zod.infer<typeof DriverDeleteWorkflowInDTOSchema>;
/** Driver -> hosting: whether there was one to drop. */
export type DriverDeleteWorkflowOutDTO = zod.infer<typeof DriverDeleteWorkflowOutDTOSchema>;

/** Hosting -> driver: bring one workflow's packages up to date. */
export type DriverSyncWorkflowInDTO = zod.infer<typeof DriverSyncWorkflowInDTOSchema>;

/**
 * Hosting -> driver (`workflows:sync`): every workflow of the user, with its packages —
 * the driver drops the others.
 */
export type DriverSyncWorkflowsInDTO = zod.infer<typeof DriverSyncWorkflowsInDTOSchema>;

/** Hosting -> driver: remove a package version from the driver's cache. */
export type DriverRemovePackageInDTO = zod.infer<typeof DriverRemovePackageInDTOSchema>;
/** Driver -> hosting: whether it was there to remove. */
export type DriverRemovePackageOutDTO = zod.infer<typeof DriverRemovePackageOutDTOSchema>;

// hosting -> driver: push the next frame to write within an already-open session.
export type DriverExecuteFrameInDTO = zod.infer<typeof DriverExecuteFrameInDTOSchema>;
// hosting -> driver: graph traversal is done (or failed) — close the serial port.
export type DriverExecuteFinishInDTO = zod.infer<typeof DriverExecuteFinishInDTOSchema>;
