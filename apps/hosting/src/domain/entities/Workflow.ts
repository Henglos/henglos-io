import type { IWorkflowRuntime, IBoardRuntime } from '@henglosio/workflow';
import { RequiredWorkflow } from '@/application/errors/entities/Workflow.error';
import { PackageLink } from './PackageLink';

type CreateWorkflowInput = {
	userId: string;
	data: IWorkflowRuntime;
	boardId: string;
	platform: string;
};

/**
 * A user's workflow: what the canvas holds (`data` — its actions, wires,
 * variables and board) and the packages it runs with.
 */
export class Workflow {
	constructor(
		public readonly id: string | null,
		public readonly userId: string,

		/** The workflow itself, in @henglosio/workflow's model. */
		public data: IWorkflowRuntime,

		/** The board package it runs on. */
		public boardId: string,
		/** The platform version it builds with. */
		public platform: string,
		/** The components it uses. */
		public components: PackageLink[],

		public readonly createdAt: Date,
		public updatedAt: Date,
	) {}

	/** A new workflow, with no components yet, not saved yet (no id). */
	public static create(input: CreateWorkflowInput): Workflow {
		if (!input) throw new RequiredWorkflow;
		const now = new Date();
		return new Workflow(
			null,
			input.userId,
			input.data,
			input.boardId,
			input.platform,
			[],
			now,
			now,
		);
	}

	public updateData(data: IWorkflowRuntime): void {
		this.data = data;
		this.touch();
	}

	/** Moves the workflow onto another board. */
	public setBoard(board: IBoardRuntime): void {
		this.boardId = board.packageId;
		this.data = { ...this.data, board };
		this.touch();
	}

	/** Adds a component — once: one that's already there is ignored. */
	public addComponent(pkg: PackageLink): void {
		if (!this.components.find(c => c.id === pkg.id)) {
			this.components.push(pkg);
			this.touch();
		}
	}

	/** @param id The component's link id. */
	public removeComponent(id: string): void {
		this.components = this.components.filter(c => c.id !== id);
		this.touch();
	}

	private touch(): void {
		this.updatedAt = new Date();
	}
}
