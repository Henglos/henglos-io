import type { CreateWorkflowIn, UpdateWorkflowIn, ListWorkflowsOut, ImportWorkflowOut } from "@henglosio/shared";
import { HIO_EXTENSION } from "@henglosio/shared/browser";
import { http } from "@shared/lib/http";
import type { WorkflowDetail } from "@shared/types/workflow.types";
import type { IFileValueSchema } from "@henglosio/workflow";

export type CreateWorkflowPayload = CreateWorkflowIn;
export type UpdateWorkflowPayload = UpdateWorkflowIn;
export type ListWorkflowsResponse = ListWorkflowsOut;

export interface ListWorkflowsParams {
	query?:   string;
	segment?: number;
	length?:  number;
}

export const createWorkflow = async (payload: CreateWorkflowPayload): Promise<string> => {
	const { data } = await http.post<{ id: string }>("/workflows", payload);
	return data.id;
};

export const getWorkflow = async (workflowId: string): Promise<WorkflowDetail> => {
	const { data } = await http.get<{ workflow: WorkflowDetail }>(`/workflows/${workflowId}`);
	return data.workflow;
};

export const listWorkflows = async (params?: ListWorkflowsParams): Promise<ListWorkflowsResponse> => {
	const { data } = await http.get<ListWorkflowsResponse>("/workflows", { params });
	return data;
};

export const updateWorkflow = async (workflowId: string, payload: UpdateWorkflowPayload): Promise<WorkflowDetail> => {
	const { data } = await http.put<{ workflow: WorkflowDetail }>(`/workflows/${workflowId}`, payload);
	return data.workflow;
};

export const deleteWorkflow = async (workflowId: string): Promise<void> => {
	await http.delete(`/workflows/${workflowId}`);
};

/** The workflow as a .hio file, and the name the server gave it. */
export const exportWorkflow = async (workflowId: string): Promise<{ blob: Blob; fileName: string }> => {
	const response = await http.get<Blob>(`/workflows/${workflowId}/export`, { responseType: "blob" });
	const disposition = String(response.headers["content-disposition"] ?? "");
	const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
	const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
	return { blob: response.data, fileName: encoded ? decodeURIComponent(encoded) : plain ?? `workflow${HIO_EXTENSION}` };
};

/** A file for a `type: file` config — answers with the value to set on it. */
export const uploadWorkflowFile = async (workflowId: string, file: Blob, name: string): Promise<IFileValueSchema> => {
	const form = new FormData();
	form.append("file", file, name);
	const { data } = await http.post<IFileValueSchema>(`/workflows/${workflowId}/files`, form, { timeout: 60_000 });
	return data;
};

/** An attached file's bytes (for its preview). */
export const getWorkflowFile = async (workflowId: string, fileId: string): Promise<Blob> => {
	const { data } = await http.get<Blob>(`/workflows/${workflowId}/files/${fileId}`, { responseType: "blob" });
	return data;
};

/** A .hio into a new workflow — installing the packages it needs. */
export const importWorkflow = async (file: File): Promise<ImportWorkflowOut> => {
	const form = new FormData();
	form.append("file", file);
	const { data } = await http.post<ImportWorkflowOut>("/workflows/import", form, { timeout: 120_000 });
	return data;
};
