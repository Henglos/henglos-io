import { createWorkflow, listPlatforms } from "@shared/api";
import { Button, Dialog, emitToast, Input, Select, Textarea } from "@henglosio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import React, { useState } from "react";
import { rsort } from "semver";
import { BoardPicker } from "../components/BoardPicker.component";
import type { BasePackage } from "@shared/types/package.types";

type CreateWorkflowPanelProps = {
	onClose: () => void;
};

export const CreateWorkflowPanel: React.FC<CreateWorkflowPanelProps> = ({ onClose }) => {

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const [pkgSelected, setPkgSelected] = useState<BasePackage>();
	const [platform, setPlatform] = useState<string>();

	const queryClient = useQueryClient();

	// Newest first: the default is the latest platform, not whatever the
	// registry happens to list first.
	const { data: platforms } = useQuery({
		queryKey: ["platforms"],
		queryFn: async () => rsort(await listPlatforms()),
	});

	// What boards are filtered by and what the workflow is created with —
	// the one picked, or the latest until one is.
	const selectedPlatform = platform ?? platforms?.[0];

	const canCreate = name.trim() !== "" && description.trim() !== "" && pkgSelected !== undefined && selectedPlatform !== undefined;

	const { mutate, isPending } = useMutation({
		mutationFn: () => createWorkflow({
			name: name.trim(),
			description: description.trim(),
			boardId: pkgSelected!.id,
			platform: selectedPlatform
		}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["workflows"] });
			emitToast("success", "Workflow created");
			onClose();
		},
		// errors are surfaced by the http interceptor's toast
	});

	const statusMessage = !name.trim()
		? "Name your workflow to continue"
		: !pkgSelected
			? "Pick a target board to continue"
			: "Add a description to continue";

	return (
		<Dialog.Content
			className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-118 w-2xl flex-col border border-line-strong rounded-lg overflow-hidden"
			onEscapeKeyDown={onClose}
			onInteractOutside={onClose}
		>

			{/* Header */}
			<div className="flex items-center justify-between px-4 py-4 border-b border-line shrink-0">
				<Dialog.Title className="">
					{name.trim() || "New Workflow"}
				</Dialog.Title>
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
								onChange={(e) => setName(e.target.value)}
								onKeyDown={(e) => { if (e.key === "Enter" && canCreate) mutate(); }}
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
								onChange={(e) => setDescription(e.target.value)}
								className="h-full resize-none"
							/>
						</Textarea.Root>
					</div>

					{platforms && platforms.length > 0 && (
						<div className="flex flex-col gap-2">
							<span className="text-fg-secondary text-xs">Platform version</span>
							<Select.Root
								value={selectedPlatform}
								onValueChange={(value) => { setPlatform(value); setPkgSelected(undefined); }}
							>
								<Select.Trigger placeholder="Select platform…" />
								<Select.Content>
									{platforms.map((p) => (
										<Select.Item key={p} value={p}>{p}</Select.Item>
									))}
								</Select.Content>
							</Select.Root>
						</div>
					)}

				</div>

				{/* Right — board picker */}
				<BoardPicker
					platform={selectedPlatform}
					selectedId={pkgSelected?.id}
					selectedLabel={pkgSelected && `${pkgSelected.name} · ${pkgSelected.version}`}
					onSelect={setPkgSelected}
				/>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between px-4 py-4 border-t border-line shrink-0">
				<span className="text-fg-muted text-xs">
					{canCreate
						? `Ready — ${pkgSelected?.name} ${pkgSelected?.version} · platform ${selectedPlatform}`
						: statusMessage}
				</span>
				<div className="flex items-center gap-2">
					<Dialog.Close asChild>
						<Button.Root variant="ghost" onClick={onClose}>
							<Button.Label>Cancel</Button.Label>
						</Button.Root>
					</Dialog.Close>
					<Button.Root
						variant="primary"
						disabled={!canCreate || isPending}
						onClick={() => mutate()}
					>
						<Button.Label>{isPending ? "Creating…" : "Create"}</Button.Label>
					</Button.Root>
				</div>
			</div>

		</Dialog.Content>
	);

};
