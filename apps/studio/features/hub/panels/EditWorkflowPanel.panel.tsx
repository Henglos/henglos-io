import { getWorkflow, updateWorkflow, type UpdateWorkflowPayload } from "@shared/api";
import { Button, Dialog, emitToast, Input, Text, Textarea } from "@henglosio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, TriangleAlert, X } from "lucide-react";
import React, { useState } from "react";
import { BoardPicker } from "../components/BoardPicker.component";
import type { BasePackage } from "@shared/types/package.types";
import type { WorkflowDetail } from "@shared/types/workflow.types";

type EditWorkflowPanelProps = {
	workflowId: string;
	onClose: () => void;
};

/** The hub's Edit: a workflow's name, description and target board. */
export const EditWorkflowPanel: React.FC<EditWorkflowPanelProps> = ({ workflowId, onClose }) => {

	const { data: workflow } = useQuery({
		queryKey: ["workflow", workflowId],
		queryFn: () => getWorkflow(workflowId),
		staleTime: 0,
	});

	return (
		<Dialog.Content
			className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-118 w-2xl flex-col border border-line-strong rounded-lg overflow-hidden"
			onEscapeKeyDown={onClose}
			onInteractOutside={onClose}
		>
			{workflow
				? <EditWorkflowForm workflow={workflow} onClose={onClose} />
				: (
					<div className="flex flex-1 items-center justify-center">
						<Dialog.Title className="sr-only">Edit workflow</Dialog.Title>
						<Loader2 size={16} className="animate-spin text-fg-muted" />
					</div>
				)}
		</Dialog.Content>
	);

};

// Mounted once the workflow is loaded, so the fields start on its values.
const EditWorkflowForm: React.FC<{ workflow: WorkflowDetail; onClose: () => void }> = ({ workflow, onClose }) => {

	const currentBoardId = workflow.data.board.packageId;

	const [name, setName] = useState(workflow.name);
	const [description, setDescription] = useState(workflow.description);
	const [board, setBoard] = useState<BasePackage>();

	const queryClient = useQueryClient();

	// Only what changed goes in the patch.
	const patch: UpdateWorkflowPayload["patch"] = [];
	const metadata = {
		...(name.trim() !== workflow.name && { name: name.trim() }),
		...(description.trim() !== workflow.description && { description: description.trim() }),
	};
	if (Object.keys(metadata).length > 0) patch.push({ op: "update:metadata", path: "", ...metadata });
	const boardChanged = board !== undefined && board.id !== currentBoardId;
	if (boardChanged) patch.push({ op: "change:board", path: "", packageId: board.id });

	const invalid = !name.trim() ? "The workflow needs a name" : !description.trim() ? "Add a description" : null;
	const canSave = !invalid && patch.length > 0;

	const { mutate, isPending } = useMutation({
		mutationFn: () => updateWorkflow(workflow.id, { patch }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["workflows"] });
			queryClient.invalidateQueries({ queryKey: ["workflow", workflow.id] });
			emitToast("success", "Workflow atualizado");
			onClose();
		},
		// errors are surfaced by the http interceptor's toast
	});

	return (
		<>

			{/* Header */}
			<div className="flex items-center justify-between px-4 py-4 border-b border-line shrink-0">
				<Dialog.Title>{name.trim() || workflow.name}</Dialog.Title>
				<Dialog.Close asChild>
					<Button.Root size="md" variant="ghost" onClick={onClose}>
						<Button.Icon><X size={14} /></Button.Icon>
					</Button.Root>
				</Dialog.Close>
			</div>

			{/* Body */}
			<div className="flex flex-1 min-h-0">

				{/* Left — details */}
				<div className="flex flex-col gap-4 p-4 w-72 shrink-0 border-r border-line">

					<div className="flex flex-col gap-2">
						<span className="text-fg-secondary text-xs">
							Name <span className="text-danger">*</span>
						</span>
						<Input.Root>
							<Input.Field
								autoFocus
								placeholder="Workflow name…"
								value={name}
								maxLength={80}
								onChange={(e) => setName(e.target.value)}
								onKeyDown={(e) => { if (e.key === "Enter" && canSave) mutate(); }}
							/>
						</Input.Root>
					</div>

					<div className="flex flex-col gap-2 flex-1">
						<span className="text-fg-secondary text-xs">
							Description <span className="text-danger">*</span>
						</span>
						<Textarea.Root className="flex-1">
							<Textarea.Field
								placeholder="What does this workflow do?"
								value={description}
								maxLength={1000}
								onChange={(e) => setDescription(e.target.value)}
								className="h-full resize-none"
							/>
						</Textarea.Root>
					</div>

					<div className="flex flex-col gap-1">
						<span className="text-fg-secondary text-xs">Platform version</span>
						<Text variant="dim" size="xs" font="mono">{workflow.platform}</Text>
						<Text variant="low" size="xs">Change it in the studio — Settings.</Text>
					</div>

				</div>

				{/* Right — board picker, only versions that build on the workflow's platform */}
				<div className="flex flex-col flex-1 min-w-0">
					<BoardPicker
						platform={workflow.platform}
						selectedId={board?.id ?? currentBoardId}
						selectedLabel={board ? `${board.name} · ${board.version}` : workflow.data.board.base.name}
						onSelect={setBoard}
					/>
					{boardChanged && (
						<div className="flex items-start gap-2 mx-4 mb-4 px-3 py-2 rounded-md border border-line bg-field">
							<TriangleAlert size={13} className="shrink-0 mt-0.5 text-fg-muted" />
							<Text variant="dim" size="xs">
								The components and actions stay. Pins picked for the old board may not exist on the new one — check their configurations, then compile and upload again.
							</Text>
						</div>
					)}
				</div>

			</div>

			{/* Footer */}
			<div className="flex items-center justify-between px-4 py-4 border-t border-line shrink-0">
				<span className="text-fg-muted text-xs">
					{invalid ?? (patch.length > 0 ? "Unsaved changes" : "Nothing changed")}
				</span>
				<div className="flex items-center gap-2">
					<Dialog.Close asChild>
						<Button.Root variant="ghost" onClick={onClose}>
							<Button.Label>Cancel</Button.Label>
						</Button.Root>
					</Dialog.Close>
					<Button.Root
						variant="primary"
						disabled={!canSave || isPending}
						onClick={() => mutate()}
					>
						<Button.Label>{isPending ? "Saving…" : "Save"}</Button.Label>
					</Button.Root>
				</div>
			</div>

		</>
	);

};
