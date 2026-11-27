import { useEffect, useState } from "react";
import { Button, Text } from "@henglosio/ui";
import type { VolumeDTO } from "@henglosio/shared/browser";
import { ChevronRight, HardDrive, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { listVolumes } from "@/shared/api";
import { Field, PortSelect, Steps, type FlashFormProps } from "./common";

// How often the UF2 drives are looked for — a board plugged in with BOOTSEL
// held shows up on its own.
const VOLUME_POLL_MS = 2000;

// How a drive is named in a target: its label — the same across plug-ins, where
// its mount (a drive letter) may not be — or its mount when it has none.
const volumeName = (volume: VolumeDTO) => volume.label || volume.mount;

/**
 * A UF2 flash: the drive the board shows in its bootloader, picked from those
 * on the driver's machine — and, for a board running MicroPython now, its
 * serial port, to restart it there. A board in its bootloader has no port: the
 * one it comes back on is found after the write.
 */
export const UF2FlashForm: React.FC<FlashFormProps<"uf2">> = ({ driverId, last, defaultPort, devices, onChange }) => {

	const [volume, setVolume] = useState(last?.volume ?? "");
	// Only a port picked for UF2 before: the toolbar's isn't, the board may be in its bootloader.
	const [port, setPort] = useState(last?.port ?? "");
	const [showPort, setShowPort] = useState(!!last?.port);
	const [drives, setDrives] = useState<VolumeDTO[] | null>(null);
	const [loading, setLoading] = useState(false);

	const look = async (show: boolean) => {
		if (show) setLoading(true);
		try {
			const found = (await listVolumes(driverId)).filter(drive => drive.uf2);
			setDrives(found);
			// The only drive there, picked for you when none is.
			if (found.length === 1) setVolume(picked => picked || volumeName(found[0]!));
		} catch {
			setDrives(prev => prev ?? []);
		} finally {
			if (show) setLoading(false);
		}
	};

	// Looked for now, and again every few seconds.
	useEffect(() => {
		let stale = false;
		const poll = () => { if (!stale) void look(false); };
		poll();
		const timer = setInterval(poll, VOLUME_POLL_MS);
		return () => { stale = true; clearInterval(timer); };
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [driverId]);

	const present = drives?.some(drive => volumeName(drive) === volume) ?? false;

	useEffect(() => {
		// A drive not there yet needs the port, to restart the board in its bootloader.
		onChange(volume && (present || port) ? { method: "uf2", volume, ...(port ? { port } : {}) } : null);
	}, [volume, present, port, onChange]);

	// The drive picked before, when it isn't there now: still offered.
	const offered: { name: string; mount: string | null }[] = [
		...(drives ?? []).map(drive => ({ name: volumeName(drive), mount: drive.mount })),
		...(volume && !present ? [{ name: volume, mount: null }] : []),
	];

	return (
		<>
			<Steps steps={[
				<>Hold <span className="font-mono text-fg">BOOTSEL</span> while plugging the board in — its drive shows up below.</>,
				"The firmware is copied to the drive, and the board restarts into it.",
				"The runtime is installed through the serial port it comes back on.",
			]} />

			<Field
				label="Drive"
				action={
					<Button.Root type="button" variant="ghost" className="ml-auto" onClick={() => look(true)} disabled={loading} title="Look for drives again">
						<Button.Icon>
							<RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
						</Button.Icon>
					</Button.Root>
				}
				hint={volume && !present
					? (port ? "Not plugged in: the board is restarted in its bootloader through its port." : "Not plugged in: hold BOOTSEL while plugging the board in — or restart it through its port, below.")
					: undefined}
			>
				{offered.length === 0 ? (
					<div className="flex items-center gap-2 h-10 px-3 rounded-md border border-dashed border-line">
						<RefreshCw size={12} className="animate-spin text-fg-muted" />
						<Text variant="low" size="xs">Waiting for a UF2 drive…</Text>
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
									className={clsx(
										"flex items-center gap-3 h-10 px-3 rounded-md border text-left transition-colors cursor-pointer",
										active ? "border-accent bg-active" : "border-line hover:bg-hover",
									)}
								>
									<HardDrive size={16} className={active ? "text-accent-fg" : "text-fg-muted"} />
									<span className="text-sm text-fg font-mono">{drive.name}</span>
									<span className="text-xs text-fg-muted ml-auto">{drive.mount ?? "not plugged in"}</span>
								</button>
							);
						})}
					</div>
				)}
			</Field>

			{/* The port: only for a board running MicroPython now. */}
			{showPort ? (
				<Field label="Serial port" hint="The board runs MicroPython now: it's restarted in its bootloader through this port.">
					<PortSelect value={port} onChange={setPort} devices={devices} none="None — the board is in its bootloader" />
				</Field>
			) : (
				<button
					type="button"
					onClick={() => { setShowPort(true); setPort(defaultPort); }}
					className="flex items-center gap-1 self-start text-xs text-fg-muted hover:text-fg cursor-pointer"
				>
					<ChevronRight size={12} />
					The board is running MicroPython? Restart it through its serial port
				</button>
			)}
		</>
	);

};
