import { useEffect, useState } from "react";
import { Button, Text } from "@henglosio/ui";
import type { VolumeDTO } from "@henglosio/shared/browser";
import { HardDrive, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { listVolumes } from "@/shared/api";
import { Field, type FlashFormProps } from "./common";

// How often the drives are looked for — a board plugged in with BOOTSEL held
// shows up on its own.
const VOLUME_POLL_MS = 2000;

// How a drive is named in a target: its label — the same across plug-ins, where
// its mount (a drive letter) may not be — or its mount when it has none.
const volumeName = (volume: VolumeDTO) => volume.label || volume.mount;

/** A UF2 flash: the drive to copy the firmware to, among the machine's — UF2 bootloaders first. */
export const UF2FlashForm: React.FC<FlashFormProps<"uf2">> = ({ driverId, last, onChange }) => {

	const [volume, setVolume] = useState(last?.volume ?? "");
	const [drives, setDrives] = useState<VolumeDTO[] | null>(null);
	const [loading, setLoading] = useState(false);

	const look = async (show: boolean) => {
		if (show) setLoading(true);
		try {
			const found = (await listVolumes(driverId)).sort((a, b) => Number(b.uf2) - Number(a.uf2));
			setDrives(found);
			// The only UF2 drive there, picked for you when none is.
			const uf2 = found.filter(drive => drive.uf2);
			if (uf2.length === 1) setVolume(picked => picked || volumeName(uf2[0]!));
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
		onChange(present ? { method: "uf2", volume } : null);
	}, [volume, present, onChange]);

	return (
		<Field
			label="Volume"
			action={
				<Button.Root type="button" variant="ghost" className="ml-auto" onClick={() => look(true)} disabled={loading} title="Refresh">
					<Button.Icon>
						<RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
					</Button.Icon>
				</Button.Root>
			}
		>
			{!drives?.length ? (
				<div className="flex items-center justify-center h-20 rounded-md border border-dashed border-line">
					<Text variant="low" size="xs">{drives ? "No volumes found" : "Looking for volumes…"}</Text>
				</div>
			) : (
				<div role="radiogroup" className="flex flex-col gap-1 max-h-60 overflow-y-auto">
					{drives.map(drive => {
						const name = volumeName(drive);
						const active = name === volume;
						return (
							<button
								key={drive.mount}
								type="button"
								role="radio"
								aria-checked={active}
								onClick={() => setVolume(name)}
								className={clsx(
									"flex items-center gap-3 h-10 px-3 rounded-md border text-left transition-colors cursor-pointer",
									active ? "border-accent bg-active" : "border-line hover:bg-hover",
								)}
							>
								<HardDrive size={16} className={active ? "text-accent-fg" : "text-fg-muted"} />
								<span className="text-sm text-fg font-mono truncate">{name}</span>
								{drive.uf2 && <span className="px-1.5 rounded-sm bg-accent-subtle text-[10px] font-mono text-accent-fg">UF2</span>}
								<span className="text-xs text-fg-muted ml-auto shrink-0">{drive.mount}</span>
							</button>
						);
					})}
				</div>
			)}
		</Field>
	);

};
