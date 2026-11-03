import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Dropdown, Text, emitToast } from "@henglosio/ui";
import type { WorkflowListItem } from "@henglosio/shared";
import { Blocks, Box, Clock, Download, Ellipsis, GitFork, Pencil, Trash, X, Zap } from "lucide-react";
import { DateTime } from "luxon";
import { deleteWorkflow, exportWorkflow, type ListWorkflowsResponse } from "@shared/api";
import { EditWorkflowPanel } from "../panels/EditWorkflowPanel.panel";

/** One workflow: the whole card opens it in the studio; the menu edits, exports or deletes it. */
export const WorkflowCard: React.FC<{ workflow: WorkflowListItem }> = ({ workflow }) => {

	const queryClient = useQueryClient();
	const [editing, setEditing] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	// Gone from the list at once; back if the server says no.
	const { mutate: remove, isPending: removing } = useMutation({
		mutationFn: () => deleteWorkflow(workflow.id),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: ["workflows"] });
			const previous = queryClient.getQueriesData<ListWorkflowsResponse>({ queryKey: ["workflows"] });
			queryClient.setQueriesData<ListWorkflowsResponse>(
				{ queryKey: ["workflows"] },
				(data) => data && { ...data, workflows: data.workflows.filter(item => item.id !== workflow.id) },
			);
			return { previous };
		},
		onError: (_error, _variables, context) => {
			context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
		},
		onSuccess: () => emitToast("success", `Deleted "${workflow.name}"`),
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
	});

	// The .hio downloads under the name the server gave it.
	const onExport = async () => {
		try {
			const { blob, fileName } = await exportWorkflow(workflow.id);
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = fileName;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch {
			emitToast("error", "Couldn't export the workflow");
		}
	};

	const updated = DateTime.fromISO(workflow.updatedAt);

	return (

		<div className="group/card relative flex flex-col gap-3 p-4 rounded-xl border border-line bg-panel transition-colors hover:bg-raised hover:border-line-strong focus-within:border-accent-line">

			{/* The card itself is the link; the menu sits above it. */}
			<Link
				href={`/studio/${workflow.id}`}
				className="absolute inset-0 rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-accent-line"
				aria-label={`Open ${workflow.name} in the studio`}
			/>

			<div className="flex items-start gap-3 w-full">

				<div className="flex items-center justify-center size-10 shrink-0 rounded-lg border bg-field border-line-subtle text-fg-muted transition-colors group-hover/card:bg-accent-subtle group-hover/card:border-accent-line group-hover/card:text-accent">
					<GitFork size={18} />
				</div>

				<div className="flex flex-col min-w-0 flex-1">
					<Text variant="high" size="md" className="truncate">{workflow.name}</Text>
					<span className="flex items-center gap-1 min-w-0 text-fg-muted">
						<Blocks size={11} className="shrink-0" />
						<Text variant="low" size="xs" className="truncate">{workflow.board}</Text>
					</span>
				</div>

				<div className="relative z-10">
					<Dropdown.Root>
						<Dropdown.Trigger asChild>
							<Button.Root variant="ghost" size="sm" aria-label="Workflow options">
								<Button.Icon><Ellipsis size={14} /></Button.Icon>
							</Button.Root>
						</Dropdown.Trigger>
						<Dropdown.Content align="end">
							<Dropdown.Item onClick={() => setEditing(true)}><Pencil size={12} />Edit</Dropdown.Item>
							<Dropdown.Item onClick={onExport}><Download size={12} />Export (.hio)</Dropdown.Item>
							<Dropdown.Item onClick={() => setConfirmDelete(true)}><Trash size={12} />Delete</Dropdown.Item>
						</Dropdown.Content>
					</Dropdown.Root>
				</div>

			</div>

			<Text variant="low" size="sm" className="line-clamp-2 min-h-8">
				{workflow.description || "No description."}
			</Text>

			<div className="flex items-center gap-3 mt-auto pt-3 border-t border-line-subtle w-full min-w-0 text-fg-muted">
				<Count icon={<Zap size={11} />} value={workflow.actions} unit="action" />
				<Count icon={<Box size={11} />} value={workflow.components} unit="component" />
				<span className="ml-auto flex items-center gap-1 min-w-0" title={updated.toLocaleString(DateTime.DATETIME_MED)}>
					<Clock size={11} className="shrink-0" />
					<Text variant="low" size="xs" className="truncate">{updated.toRelative() ?? "just now"}</Text>
				</span>
			</div>

			<Dialog.Root open={editing} onOpenChange={setEditing}>
				<Dialog.Overlay />
				{editing && <EditWorkflowPanel workflowId={workflow.id} onClose={() => setEditing(false)} />}
			</Dialog.Root>

			<Dialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
				<Dialog.Overlay />
				{confirmDelete && (
					<Dialog.Content
						className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col w-md max-w-[calc(100vw-2rem)] border border-line-strong rounded-lg overflow-hidden bg-raised"
						onEscapeKeyDown={() => setConfirmDelete(false)}
						onInteractOutside={() => setConfirmDelete(false)}
					>
						<div className="flex items-center justify-between px-4 py-4 border-b border-line">
							<Dialog.Title>Delete workflow</Dialog.Title>
							<Dialog.Close asChild>
								<Button.Root size="md" variant="ghost">
									<Button.Icon><X size={14} /></Button.Icon>
								</Button.Root>
							</Dialog.Close>
						</div>
						<div className="p-4">
							<Text variant="dim" size="sm">
								<span className="text-fg">{workflow.name}</span> and everything in it will be deleted. This can&apos;t be undone —
								export it first if you might want it back.
							</Text>
						</div>
						<div className="flex items-center justify-end gap-2 px-4 py-4 border-t border-line">
							<Dialog.Close asChild>
								<Button.Root variant="ghost"><Button.Label>Cancel</Button.Label></Button.Root>
							</Dialog.Close>
							<Button.Root variant="destructive" disabled={removing} onClick={() => { setConfirmDelete(false); remove(); }}>
								<Button.Icon><Trash size={14} /></Button.Icon>
								<Button.Label>Delete</Button.Label>
							</Button.Root>
						</div>
					</Dialog.Content>
				)}
			</Dialog.Root>

		</div>

	);

};

const Count: React.FC<{ icon: React.ReactNode; value: number; unit: string }> = ({ icon, value, unit }) => (
	<span className="flex items-center gap-1 shrink-0">
		{icon}
		<Text variant="dim" size="xs" className="tabular-nums">{value}</Text>
		<Text variant="low" size="xs">{unit}{value === 1 ? "" : "s"}</Text>
	</span>
);
