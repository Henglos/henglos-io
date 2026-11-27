import { useState } from "react";
import { Button, Dialog, Text } from "@henglosio/ui";
import type { FlashMethodName, FlashTarget } from "@henglosio/shared/browser";
import { X, Zap } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { DeviceSelectionAtom, DevicesAtom, FlashTargetsAtom } from "@/features/studio/store/driver.store";
import { FLASH_METHODS } from "../flashMethods";
import { FLASH_FORMS, type FlashFormProps } from "./flash-forms";

type FlashDialogProps = {
	workflowId: string;
	driverId: string;
	/** How to write it — picked in the toolbar, one of the board's. */
	method: FlashMethodName;
	onClose: () => void;
	/** Starts the flash — the dialog closes once it's started. */
	onFlash: (target: FlashTarget) => Promise<void>;
};

/**
 * Where to write the board's firmware, by `method` (picked in the toolbar):
 * the dialog's frame, and the method's own form (FLASH_FORMS) inside it. Opens
 * with the last target of that method picked for the workflow.
 */
export const FlashDialog: React.FC<FlashDialogProps> = ({ workflowId, driverId, method, onClose, onFlash }) => {

	const devices = useAtomValue(DevicesAtom);
	const selectedDevice = useAtomValue(DeviceSelectionAtom);
	const [targets, setTargets] = useAtom(FlashTargetsAtom);
	const last = targets[workflowId];

	const [target, setTarget] = useState<FlashTarget | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!target) return;
		setStarting(true);
		setError(null);
		try {
			await onFlash(target);
			setTargets(prev => ({ ...prev, [workflowId]: target }));
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setStarting(false);
		}
	};

	// The method's form — each typed for its own targets.
	const Form = FLASH_FORMS[method] as React.FC<FlashFormProps<FlashMethodName>>;

	return (
		<Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
			<Dialog.Content
				className="left-1/2 top-1/2 w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line shadow-[0_8px_32px_rgb(0_0_0/0.4)]"
				aria-describedby={undefined}
			>
				<form onSubmit={submit} className="flex flex-col">
					<div className="flex items-center gap-2 px-4 h-11 border-b border-line-subtle">
						<Zap size={14} className="text-accent-fg" />
						<Dialog.Title>Flash by {FLASH_METHODS[method].label}</Dialog.Title>
						<Dialog.Close asChild>
							<Button.Root type="button" variant="ghost" className="ml-auto">
								<Button.Icon>
									<X size={12} />
								</Button.Icon>
							</Button.Root>
						</Dialog.Close>
					</div>

					<div className="flex flex-col gap-5 p-4">

						<Form
							key={method}
							driverId={driverId}
							last={last?.method === method ? last : undefined}
							defaultPort={last?.port ?? selectedDevice?.port ?? ""}
							devices={devices}
							onChange={setTarget}
						/>

						{error && <Text variant="low" size="xs" className="text-danger!">{error}</Text>}

						<Button.Root type="submit" variant="primary" size="md" disabled={!target || starting} className="w-full!">
							<Button.Label>{starting ? "Starting…" : "Flash"}</Button.Label>
						</Button.Root>

					</div>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	);

};
