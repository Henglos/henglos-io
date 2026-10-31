import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { WorkflowFile } from '@/domain/entities/WorkflowFile';
import type { IWorkflowFileRepository } from '@/domain/repositories/IWorkflowFileRepository.repo';
import { SqliteConnection } from './SqliteConnection';
import { workflowFiles } from './schema';

/** IWorkflowFileRepository on SQLite: the `workflow_files` table — the bytes in a blob column. */
@Injectable()
export class WorkflowFileSqliteRepo implements IWorkflowFileRepository {

	constructor(private readonly database: SqliteConnection) {}

	private toDomain(row: typeof workflowFiles.$inferSelect): WorkflowFile {
		return { ...row, data: Buffer.from(row.data) };
	}

	async save(file: Omit<WorkflowFile, 'id' | 'createdAt'>): Promise<WorkflowFile> {

		// The same content attached twice is one file — the board keeps it by sha256 anyway.
		const existing = await this.database.connection((db) => db.query.workflowFiles.findFirst({
			where: and(eq(workflowFiles.workflowId, file.workflowId), eq(workflowFiles.sha256, file.sha256)),
		}));
		if (existing) return this.toDomain(existing);

		const [row] = await this.database.connection((db) => db.insert(workflowFiles).values({
			workflowId: file.workflowId,
			name: file.name,
			mime: file.mime,
			size: file.size,
			sha256: file.sha256,
			data: file.data,
		}).returning());

		return this.toDomain(row);

	}

	async findById(workflowId: string, id: string): Promise<WorkflowFile | null> {
		const row = await this.database.connection((db) => db.query.workflowFiles.findFirst({
			where: and(eq(workflowFiles.workflowId, workflowId), eq(workflowFiles.id, id)),
		}));
		return row ? this.toDomain(row) : null;
	}

	async findByWorkflow(workflowId: string): Promise<WorkflowFile[]> {
		const rows = await this.database.connection((db) => db.query.workflowFiles.findMany({
			where: eq(workflowFiles.workflowId, workflowId),
		}));
		return rows.map((row) => this.toDomain(row));
	}

}
