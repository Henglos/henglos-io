import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { Text, emitToast } from "@henglosio/ui";
import type { IFileInputSchema, IFileValueSchema } from "@henglosio/workflow";
import { FileImage, FileUp, Loader2, Paperclip, X } from "lucide-react";
import clsx from "clsx";
import { getWorkflowFile, uploadWorkflowFile } from "@shared/api";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { decodePbm, drawPbm, imageToPbm, type Pbm } from "@/features/studio/lib/imageToPbm";

// What the hosting stores per file (WORKFLOW_FILE_MAX_BYTES).
const MAX_BYTES = 64 * 1024;

const kb = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

type FileFieldProps = {
	base: IFileInputSchema;
	value: IFileValueSchema | undefined;
	onChange: (value: IFileValueSchema | undefined) => void;
};

/**
 * A `type: file` config: attach a file (uploaded to the workflow), shown by
 * name and size, removable. With `image`, a picked image is first turned into
 * the 1-bit bitmap the config wants (imageToPbm) — and previewed as the
 * screen will show it.
 */
export const FileField: React.FC<FileFieldProps> = ({ base, value, onChange }) => {

	const workflowId = useAtomValue(WorkflowAtom)?.id;
	const input = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const maxSize = Math.min(base.maxSize ?? MAX_BYTES, MAX_BYTES);
	const image = base.image;

	const accept = [...(base.accept ?? []), ...(image ? ["image/*", ".pbm"] : [])].join(",") || undefined;

	const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const picked = event.target.files?.[0];
		event.target.value = "";
		if (!picked || !workflowId) return;

		setBusy(true);
		try {
			let data: Blob = picked;
			let name = picked.name;
			// An image becomes the bitmap the config wants — a .pbm is taken as is.
			if (image && !picked.name.toLowerCase().endsWith(".pbm")) {
				const { pbm, bytes } = await imageToPbm(picked, image.maxWidth, image.maxHeight);
				data = new Blob([bytes as BlobPart], { type: "image/x-portable-bitmap" });
				name = `${picked.name.replace(/\.[^.]+$/, "")}.pbm`;
				if (pbm.width < 1 || pbm.height < 1) throw new Error("The image is empty");
			}
			if (data.size > maxSize) throw new Error(`It's ${kb(data.size)} — at most ${kb(maxSize)} fit`);
			onChange(await uploadWorkflowFile(workflowId, data, name));
		} catch (err) {
			// The http interceptor toasts request errors; this one is ours (conversion, size).
			if (err instanceof Error && !("isAxiosError" in err)) emitToast("error", `Couldn't attach ${picked.name}: ${err.message}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-2 w-56 nodrag">

			<input ref={input} type="file" accept={accept} className="hidden" onChange={onPick} />

			{value ? (
				<div className="flex items-center gap-2 h-8 px-2 rounded-md border border-line bg-field">
					{image ? <FileImage size={12} className="shrink-0 text-accent-fg" /> : <Paperclip size={12} className="shrink-0 text-accent-fg" />}
					<button
						type="button"
						onClick={() => input.current?.click()}
						className="flex-1 min-w-0 text-left cursor-pointer"
						title="Replace it"
					>
						<Text variant="high" size="xs" className="truncate block">{value.name}</Text>
					</button>
					<Text variant="low" size="xs" className="shrink-0 tabular-nums">{kb(value.size)}</Text>
					<button type="button" onClick={() => onChange(undefined)} className="shrink-0 cursor-pointer text-fg-muted hover:text-fg" aria-label="Remove the file">
						<X size={12} />
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => input.current?.click()}
					disabled={busy || !workflowId}
					className={clsx(
						"flex items-center gap-2 h-8 px-2 rounded-md border border-dashed text-left cursor-pointer transition-colors",
						"border-line bg-field hover:bg-field-hover hover:border-line-strong disabled:opacity-60 disabled:cursor-default",
					)}
				>
					{busy ? <Loader2 size={12} className="shrink-0 animate-spin text-fg-muted" /> : <FileUp size={12} className="shrink-0 text-fg-muted" />}
					<Text variant="low" size="xs" className="truncate">
						{busy ? "Attaching…" : image ? `Attach an image (fits ${image.maxWidth}×${image.maxHeight})` : "Attach a file"}
					</Text>
				</button>
			)}

			{value && image && workflowId && <PbmPreview workflowId={workflowId} file={value} />}

		</div>
	);

};

// The attached bitmap as the screen draws it: lit pixels on black.
const PbmPreview: React.FC<{ workflowId: string; file: IFileValueSchema }> = ({ workflowId, file }) => {

	const canvas = useRef<HTMLCanvasElement>(null);
	const { data: pbm } = useQuery({
		queryKey: ["workflow-file", workflowId, file.fileId],
		queryFn: async (): Promise<Pbm | null> => decodePbm(new Uint8Array(await (await getWorkflowFile(workflowId, file.fileId)).arrayBuffer())),
		staleTime: Infinity,
	});

	useEffect(() => {
		if (canvas.current && pbm) drawPbm(canvas.current, pbm, pbm.width <= 64 ? 2 : 1, "#d8f3ff", "#05080a");
	}, [pbm]);

	if (!pbm) return null;
	return (
		<div className="flex flex-col gap-1">
			<canvas ref={canvas} className="max-w-full rounded-sm border border-line-subtle [image-rendering:pixelated]" />
			<Text variant="low" size="xs" className="tabular-nums">{pbm.width}×{pbm.height} px</Text>
		</div>
	);

};
