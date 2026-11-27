import { useEffect, useState } from "react";
import { Button, Dialog, Input, Select, Text, ToggleGroup } from "@henglosio/ui";
import { FlashMethodNameSchema, type FlashMethodName, type FlashTarget, type VolumeDTO } from "@henglosio/shared";
import { RefreshCw, X, Zap } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { DeviceSelectionAtom, DevicesAtom, FlashTargetsAtom } from "@/features/studio/store/driver.store";
import { listVolumes } from "@/shared/api";

// Every way a firmware can be written — the board's are offered, the rest shown
// disabled, so it's clear what this board can't do.
const ALL_METHODS: readonly FlashMethodName[] = FlashMethodNameSchema.options;

const METHODS: Record<FlashMethodName, { label: string; description: string }> = {
	serial: {
		label: "Serial",
		description: "Written through the board's serial port, by its own tool (esptool…) — the board is put in its bootloader through the port.",
	},
	uf2: {
		label: "UF2 drive",
		description: "Copied to the drive the board shows in its bootloader (RPI-RP2…) — like dragging the file onto it.",
	},
};

type FlashDialogProps = {
	workflowId: string;
	driverId: string;
	/** The ways the workflow's board can be written, the preferred first (its manifest's firmware.methods). */
	methods: FlashMethodName[];
	/** The baud rate picked in the toolbar, for a serial write. */
	baudrate: number | null;
	onClose: () => void;
	/** Starts the flash — the dialog closes once it's started. */
	onFlash: (target: FlashTarget) => Promise<void>;
};

/**
 * Where and how to write the board's firmware: the method (one of the board's)
 * and its address — the serial port, and for UF2 the drive too. The board's
 * REPL goes through the port either way: the runtime is installed through it
 * once the firmware is written. Opens with the last target picked for the workflow.
 */
export const FlashDialog: React.FC<FlashDialogProps> = ({ workflowId, driverId, methods, baudrate, onClose, onFlash }) => {

	const devices = useAtomValue(DevicesAtom);
	const selectedDevice = useAtomValue(DeviceSelectionAtom);
	const [targets, setTargets] = useAtom(FlashTargetsAtom);
	const last = targets[workflowId];

	const [method, setMethod] = useState<FlashMethodName>(last && methods.includes(last.method) ? last.method : methods[0] ?? "serial");
	const [port, setPort] = useState(last?.port ?? selectedDevice?.port ?? "");
	const [volume, setVolume] = useState(last?.method === "uf2" ? last.volume : "");
	const [volumes, setVolumes] = useState<VolumeDTO[]>([]);
	const [loadingVolumes, setLoadingVolumes] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);

	const refreshVolumes = async () => {
		setLoadingVolumes(true);
		try {
			setVolumes(await listVolumes(driverId));
		} catch {
			setVolumes([]);
		} finally {
			setLoadingVolumes(false);
		}
	};

	// The drives, once UF2 is picked — again with the refresh button.
	useEffect(() => {
		if (method !== "uf2") return;
		let stale = false;
		listVolumes(driverId).then(found => { if (!stale) setVolumes(found); }, () => {});
		return () => { stale = true; };
	}, [method, driverId]);

	const target: FlashTarget | null = !port
		? null
		: method === "uf2"
			? (volume.trim() ? { method: "uf2", port, volume: volume.trim() } : null)
			: { method: "serial", port, ...(baudrate ? { baudrate } : {}) };

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

	return (
		<Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
			<Dialog.Content
				className="left-1/2 top-1/2 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line shadow-[0_8px_32px_rgb(0_0_0/0.4)]"
				aria-describedby={undefined}
			>
				<form onSubmit={submit} className="flex flex-col">
					<div className="flex items-center gap-2 px-4 h-11 border-b border-line-subtle">
						<Zap size={14} className="text-accent-fg" />
						<Dialog.Title>Flash the board</Dialog.Title>
						<Dialog.Close asChild>
							<Button.Root type="button" variant="ghost" className="p-2! ml-auto">
								<Button.Icon>
									<X size={12} />
								</Button.Icon>
							</Button.Root>
						</Dialog.Close>
					</div>

					<div className="flex flex-col gap-5 p-4">

						<Field label="Method" hint={METHODS[method].description}>
							<ToggleGroup.Root
								size="md"
								value={method}
								onValueChange={value => { if (value && methods.includes(value as FlashMethodName)) setMethod(value as FlashMethodName); }}
								className="w-full"
							>
								{ALL_METHODS.map(name => {
									const supported = methods.includes(name);
									return (
										<ToggleGroup.Item
											key={name}
											value={name}
											disabled={!supported}
											title={supported ? METHODS[name].description : `This board can't be written by ${METHODS[name].label}.`}
											className={`flex-1 justify-center ${supported ? "" : "opacity-40 cursor-not-allowed!"}`}
										>
											{METHODS[name].label}
										</ToggleGroup.Item>
									);
								})}
							</ToggleGroup.Root>
						</Field>

						<Field
							label="Serial port"
							hint={method === "uf2"
								? "Where the board's REPL is: it restarts the board in its bootloader when the drive isn't there, and installs the runtime once the firmware is written."
								: "The board's port — the firmware is written through it, then the runtime installed."}
						>
							<Select.Root value={port} onValueChange={setPort} className="w-full">
								<Select.Trigger placeholder={ports.length ? "Pick the board's port" : "No board plugged in"} />
								<Select.Content>
									{ports.map(p => <Select.Item key={p} value={p}>{p}</Select.Item>)}
								</Select.Content>
							</Select.Root>
						</Field>

						{method === "uf2" && (
							<Field label="Drive" hint="Its label (RPI-RP2) or where it's mounted (E:\). Not there yet: the board is restarted in its bootloader through the port.">
								<div className="flex items-center gap-1">
									<Input.Root className="h-8 flex-1" value={volume}>
										<Input.Field
											placeholder="RPI-RP2"
											value={volume}
											onChange={e => setVolume(e.target.value)}
											list="flash-volumes"
											className="font-mono"
										/>
									</Input.Root>
									<datalist id="flash-volumes">
										{volumes.map(v => <option key={v.mount} value={v.mount}>{v.label || v.mount}</option>)}
									</datalist>
									<Button.Root type="button" variant="ghost" className="p-2!" onClick={refreshVolumes} disabled={loadingVolumes} title="Look for drives again">
										<Button.Icon>
											<RefreshCw size={12} className={loadingVolumes ? "animate-spin" : undefined} />
										</Button.Icon>
									</Button.Root>
								</div>
								{volumes.length > 0 && (
									<div className="flex flex-wrap gap-1 pt-1">
										{volumes.map(v => (
											<Button.Root key={v.mount} type="button" variant="ghost" className="h-6! px-2! text-xs!" onClick={() => setVolume(v.label || v.mount)}>
												{v.label ? `${v.label} (${v.mount})` : v.mount}
											</Button.Root>
										))}
									</div>
								)}
							</Field>
						)}

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
	children: React.ReactNode;
};

const Field: React.FC<FieldProps> = ({ label, hint, children }) => (
	<div className="flex flex-col gap-1.5">
		<Text variant="dim" size="xs">{label}</Text>
		{children}
		{hint && <Text variant="low" size="xs">{hint}</Text>}
	</div>
);
