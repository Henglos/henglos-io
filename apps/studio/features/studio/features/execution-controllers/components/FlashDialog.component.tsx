import { useEffect, useState } from "react";
import { Button, Dialog, Select, Text } from "@henglosio/ui";
import type { FlashMethodName, FlashTarget, VolumeDTO } from "@henglosio/shared/browser";
import { HardDrive, RefreshCw, X, Zap } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { DeviceSelectionAtom, DevicesAtom, FlashTargetsAtom } from "@/features/studio/store/driver.store";
import { listVolumes } from "@/shared/api";
import { FLASH_METHODS } from "../flashMethods";

// How often the UF2 drives are looked for while the dialog shows them — a board
// plugged in with BOOTSEL held shows up on its own.
const VOLUME_POLL_MS = 2000;

// The Select's value for "no serial port" (a Select item can't be "").
const NO_PORT = "__none__";

// How a drive is named in a target: its label — the same across plug-ins, where
// its mount (a drive letter) may not be — or its mount when it has none.
const volumeName = (volume: VolumeDTO) => volume.label || volume.mount;

type FlashDialogProps = {
	workflowId: string;
	driverId: string;
	/** How to write it — picked in the toolbar, one of the board's. */
	method: FlashMethodName;
	/** The baud rate picked in the toolbar, for a serial write. */
	baudrate: number | null;
	onClose: () => void;
	/** Starts the flash — the dialog closes once it's started. */
	onFlash: (target: FlashTarget) => Promise<void>;
};

/**
 * Where to write the board's firmware, by `method` (picked in the toolbar).
 * Serial: the board's port. UF2: the board's drive, picked
 * from those on the driver's machine — and its serial port, if it has one now:
 * a board in its bootloader shows only its drive, and the port it comes back
 * on is found after the write. Opens with the last target picked for the workflow.
 */
export const FlashDialog: React.FC<FlashDialogProps> = ({ workflowId, driverId, method, baudrate, onClose, onFlash }) => {

	const devices = useAtomValue(DevicesAtom);
	const selectedDevice = useAtomValue(DeviceSelectionAtom);
	const [targets, setTargets] = useAtom(FlashTargetsAtom);
	const last = targets[workflowId];

	const [port, setPort] = useState(last?.port ?? selectedDevice?.port ?? "");
	const [volume, setVolume] = useState(last?.method === "uf2" ? last.volume : "");
	const [drives, setDrives] = useState<VolumeDTO[] | null>(null);
	const [loadingDrives, setLoadingDrives] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);

	const refreshDrives = async () => {
		setLoadingDrives(true);
		try {
			setDrives((await listVolumes(driverId)).filter(drive => drive.uf2));
		} catch {
			setDrives([]);
		} finally {
			setLoadingDrives(false);
		}
	};

	// The UF2 drives, while UF2 is picked — looked for again every few seconds.
	useEffect(() => {
		if (method !== "uf2") return;
		let stale = false;
		const look = () => listVolumes(driverId).then(found => { if (!stale) setDrives(found.filter(drive => drive.uf2)); }, () => {});
		void look();
		const timer = setInterval(look, VOLUME_POLL_MS);
		return () => { stale = true; clearInterval(timer); };
	}, [method, driverId]);

	// The only drive there, picked for you when none is.
	useEffect(() => {
		if (method === "uf2" && !volume && drives?.length === 1) setVolume(volumeName(drives[0]!));
	}, [method, volume, drives]);

	const present = drives?.some(drive => volumeName(drive) === volume) ?? false;

	const target: FlashTarget | null = method === "uf2"
		// A drive not there yet needs the port, to restart the board in its bootloader.
		? (volume && (present || port) ? { method: "uf2", volume, ...(port ? { port } : {}) } : null)
		: (port ? { method: "serial", port, ...(baudrate ? { baudrate } : {}) } : null);

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

	// The port picked before may be unplugged now: still offered, so it can be kept.
	const ports = [...new Set([...devices.map(device => device.port), ...(port ? [port] : [])])];

	// The drive picked before, when it isn't there now: still offered — the board
	// is restarted in its bootloader through its port.
	const offered: { name: string; mount: string | null }[] = [
		...(drives ?? []).map(drive => ({ name: volumeName(drive), mount: drive.mount })),
		...(volume && !present ? [{ name: volume, mount: null }] : []),
	];

	return (
		<Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
			<Dialog.Content
				className="left-1/2 top-1/2 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line shadow-[0_8px_32px_rgb(0_0_0/0.4)]"
				aria-describedby={undefined}
			>
				<form onSubmit={submit} className="flex flex-col">
					<div className="flex items-center gap-2 px-4 h-11 border-b border-line-subtle">
						<Zap size={14} className="text-accent-fg" />
						<Dialog.Title>Flash the board · {FLASH_METHODS[method].label}</Dialog.Title>
						<Dialog.Close asChild>
							<Button.Root type="button" variant="ghost" className="p-2! ml-auto">
								<Button.Icon>
									<X size={12} />
								</Button.Icon>
							</Button.Root>
						</Dialog.Close>
					</div>

					<div className="flex flex-col gap-5 p-4">

						<Text variant="low" size="xs">{FLASH_METHODS[method].description}</Text>

						{method === "uf2" && (
							<Field
								label="Drive"
								action={
									<Button.Root type="button" variant="ghost" className="p-1! ml-auto" onClick={refreshDrives} disabled={loadingDrives} title="Look for drives again">
										<Button.Icon>
											<RefreshCw size={12} className={loadingDrives ? "animate-spin" : undefined} />
										</Button.Icon>
									</Button.Root>
								}
								hint={offered.length === 0
									? "No UF2 drive yet — hold BOOTSEL while plugging the board in, and it shows up here."
									: present || !volume
										? "The drive the board shows in its bootloader."
										: "Not plugged in now: the board is restarted in its bootloader through its serial port."}
							>
								{offered.length === 0 ? (
									<div className="flex items-center gap-2 h-9 px-3 rounded-md border border-dashed border-line text-fg-muted">
										<RefreshCw size={12} className="animate-spin" />
										<Text variant="low" size="xs">Looking for drives…</Text>
									</div>
								) : (
									<div role="radiogroup" className="flex flex-col gap-1">
										{offered.map(drive => {
											const active = drive.name === volume;
											return (
												<button
													key={drive.name}
													type="button"
													role="radio"
													aria-checked={active}
													onClick={() => setVolume(drive.name)}
													className={`flex items-center gap-2 h-9 px-3 rounded-md border text-left transition-colors cursor-pointer ${active ? "border-accent bg-active" : "border-line hover:bg-hover"}`}
												>
													<HardDrive size={14} className={active ? "text-accent-fg" : "text-fg-muted"} />
													<span className="text-xs text-fg font-mono">{drive.name}</span>
													<span className="text-xs text-fg-muted ml-auto">{drive.mount ?? "not plugged in"}</span>
												</button>
											);
										})}
									</div>
								)}
							</Field>
						)}

						<Field
							label={method === "uf2" ? "Serial port (optional)" : "Serial port"}
							hint={method === "uf2"
								? "Where the board's REPL is, if it has one now — to restart it in its bootloader. None: the board is in its bootloader already, and the port it comes back on is found after the write."
								: "The board's port — the firmware is written through it, then the runtime installed."}
						>
							<Select.Root value={port || (method === "uf2" ? NO_PORT : "")} onValueChange={value => setPort(value === NO_PORT ? "" : value)} className="w-full">
								<Select.Trigger placeholder={ports.length ? "Pick the board's port" : "No board plugged in"} />
								<Select.Content>
									{method === "uf2" && <Select.Item value={NO_PORT}>None — the board is in its bootloader</Select.Item>}
									{ports.map(p => <Select.Item key={p} value={p}>{p}</Select.Item>)}
								</Select.Content>
							</Select.Root>
						</Field>

						{error && <Text variant="low" size="xs" className="text-danger!">{error}</Text>}

						<Button.Root type="submit" disabled={!target || starting} className="justify-center">
							{starting ? "Starting…" : "Flash"}
						</Button.Root>

					</div>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	);

};

type FieldProps = {
	label: string;
	hint?: string;
	/** Next to the label: a button of the field's. */
	action?: React.ReactNode;
	children: React.ReactNode;
};

const Field: React.FC<FieldProps> = ({ label, hint, action, children }) => (
	<div className="flex flex-col gap-1.5">
		<div className="flex items-center">
			<Text variant="dim" size="xs">{label}</Text>
			{action}
		</div>
		{children}
		{hint && <Text variant="low" size="xs">{hint}</Text>}
	</div>
);
