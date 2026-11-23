import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';
import {
	type IWorkflowRuntime,
	migrateLegacyLogic,
	readWorkflowDoc,
	reconcileWorkflowDoc,
	WorkflowRuntime,
} from '@henglosio/workflow';

import { type IWorkflowRepository } from '@/domain/repositories/IWorkflowRepository.repo';
import { TokenService } from './Token.service';

/** Who's connected to a collaborative doc, and which workflow it is — set when they authenticate. */
export type CollabContext = { userId: string; workflowId: string };

/** A live doc's state at the start of a server-side mutation — see snapshot()/merge(). */
export type CollabSnapshot = { update: Uint8Array; data: IWorkflowRuntime };

const DOC_PREFIX = 'workflow:';

/** The collaborative doc's name for a workflow: "workflow:<id>". */
export const workflowDocName = (workflowId: string) => `${DOC_PREFIX}${workflowId}`;

const workflowIdFromDocName = (documentName: string) =>
	documentName.startsWith(DOC_PREFIX) ? documentName.slice(DOC_PREFIX.length) : null;

/**
 * Owns the Hocuspocus instance behind /io/collab (the socket wiring lives in
 * presentation/collab/Collab.gateway.ts). One Y.Doc per workflow, named
 * "workflow:<id>", shaped by @henglosio/workflow's WorkflowDoc. Only the
 * workflow's owner can open it.
 *
 * Persistence: `workflows.data` (JSON) stays the source of truth that
 * compile/flash/execute read. On load the stored Yjs state is applied and then
 * reconciled to that JSON, so HTTP updates made while nobody had the doc open
 * are never lost; on store both are written together.
 */
@Injectable()
export class WorkflowCollabService implements OnModuleDestroy {
	private readonly logger = new Logger(WorkflowCollabService.name);

	readonly hocuspocus: Hocuspocus<CollabContext>;

	constructor(
		private readonly tokenService: TokenService,
		@Inject('IWorkflowRepository')
		private readonly workflowRepository: IWorkflowRepository,
	) {
		this.hocuspocus = new Hocuspocus<CollabContext>({
			name: 'workflow-collab',
			quiet: true,
			debounce: 2000,
			maxDebounce: 10000,

			onAuthenticate: async ({ token, documentName }) => {
				const workflowId = workflowIdFromDocName(documentName);
				if (!workflowId) throw new Error('unknown document');

				const { userId } = this.tokenService.verify(token);

				const workflow = await this.workflowRepository.findById(workflowId);
				if (!workflow || workflow.userId !== userId) throw new Error('forbidden');

				return { userId, workflowId } satisfies CollabContext;
			},

			onLoadDocument: async ({ documentName, document }) => {
				const workflowId = workflowIdFromDocName(documentName)!;

				const [workflow, state] = await Promise.all([
					this.workflowRepository.findById(workflowId),
					this.workflowRepository.findCollabState(workflowId),
				]);
				if (!workflow) throw new Error('workflow not found');

				if (state) Y.applyUpdate(document, state);
				// If / Switch nodes of the old shape move to rows here, once — the doc
				// carries them to every client, and the next store writes them back.
				reconcileWorkflowDoc(document, migrateLegacyLogic(workflow.data));

				return document;
			},

			onStoreDocument: async ({ documentName, document }) => {
				await this.store(workflowIdFromDocName(documentName)!, document);
			},
		});
	}

	onModuleDestroy() {
		this.hocuspocus.flushPendingStores();
	}

	// Writes the doc: its JSON projection and its Yjs state, together.
	private async store(workflowId: string, document: Y.Doc) {
		const data = readWorkflowDoc(document);

		// Never let a malformed doc overwrite the JSON everything else reads.
		const parsed = WorkflowRuntime.safeParse(data);
		if (!parsed.success) {
			this.logger.error(`Refusing to store workflow ${workflowId}: ${parsed.error.message}`);
			return;
		}

		await this.workflowRepository.saveCollabState(workflowId, data, Y.encodeStateAsUpdate(document));
	}

	/**
	 * Writes the live doc to the database right away instead of waiting for
	 * the store debounce. Anything about to read `workflows.data` for real work
	 * (compile/flash/record/execute) calls this first, so it never acts on a
	 * version older than what's on the user's screen.
	 */
	async persistNow(workflowId: string): Promise<void> {
		const document = this.hocuspocus.documents.get(workflowDocName(workflowId));
		if (document) await this.store(workflowId, document);
	}

	/**
	 * Captures the live doc (if anyone has it open) before a server-side
	 * mutation. Returns null when the doc isn't loaded — then the stored JSON
	 * is current and the mutation can work on it directly.
	 */
	snapshot(workflowId: string): CollabSnapshot | null {
		const document = this.hocuspocus.documents.get(workflowDocName(workflowId));
		if (!document) return null;

		return {
			update: Y.encodeStateAsUpdate(document),
			data: structuredClone(readWorkflowDoc(document)),
		};
	}

	/**
	 * Folds the result of a server-side mutation into the live doc as a
	 * concurrent edit: `data` is reconciled onto a copy of the doc as it was at
	 * snapshot() time and only that delta is applied. Anything collaborators
	 * changed in the meantime (a node dragged while a package was resolving)
	 * survives instead of being overwritten by the mutation's stale copy.
	 * Returns the merged JSON, or null if the doc was unloaded meanwhile.
	 */
	async merge(workflowId: string, snapshot: CollabSnapshot, data: IWorkflowRuntime): Promise<IWorkflowRuntime | null> {
		const documentName = workflowDocName(workflowId);
		if (!this.hocuspocus.documents.has(documentName)) return null;

		const scratch = new Y.Doc();
		Y.applyUpdate(scratch, snapshot.update);
		const before = Y.encodeStateVector(scratch);
		reconcileWorkflowDoc(scratch, data);
		const delta = Y.encodeStateAsUpdate(scratch, before);
		scratch.destroy();

		const connection = await this.hocuspocus.openDirectConnection(documentName);
		let merged: IWorkflowRuntime | null = null;
		try {
			await connection.transact((document) => {
				Y.applyUpdate(document, delta);
				merged = readWorkflowDoc(document);
			});
		} finally {
			await connection.disconnect();
		}

		return merged;
	}
}
