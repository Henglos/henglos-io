import { execFile } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { VolumeDTO } from "@henglosio/shared";
import { injectable } from "tsyringe";
import { ReplSession } from "./ReplSession.service.js";
import { createLogger } from "../../infrastructure/logger/Logger.js";

const log = createLogger("uf2");
const run = promisify(execFile);

/**
 * The host's removable drives — where a board's UF2 bootloader shows up
 * (RPI-RP2 on an RP2040): listing them, finding one, and getting a board there.
 */
@injectable()
export class UF2Drives {

	/** The removable drives mounted now. */
	async list(): Promise<VolumeDTO[]> {
		if (process.platform === "win32") return listOnWindows();
		const volumes: VolumeDTO[] = [];
		for (const root of mountRoots()) {
			const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
			for (const entry of entries) {
				if (entry.isDirectory()) volumes.push({ label: entry.name, mount: path.join(root, entry.name) });
			}
		}
		return volumes;
	}

	/**
	 * Where `volume` is mounted, or null: a path that exists is taken as it is
	 * (E:\, /Volumes/RPI-RP2), anything else as a drive's label (RPI-RP2).
	 */
	async find(volume: string): Promise<string | null> {
		if (looksLikePath(volume)) return await exists(volume) ? volume : null;
		const found = (await this.list()).find(v => v.label === volume);
		return found?.mount ?? null;
	}

	/**
	 * Has the board on `port` restart in its bootloader, through MicroPython's
	 * REPL (machine.bootloader()). The board drops the port as it restarts, so
	 * the REPL never answers — that isn't a failure; a board that won't open a
	 * REPL at all is, and its error is thrown.
	 */
	async enterBootloader(port: string): Promise<void> {
		const repl = await ReplSession.open(port);
		try {
			await repl.exec("import machine\nmachine.bootloader()", 2000);
		} catch (err) {
			log.debug(`${port} left for its bootloader: ${err instanceof Error ? err.message : String(err)}`);
		}
		await repl.close(false).catch(() => {});
	}

}

// Where the OS mounts removable drives, outside Windows.
function mountRoots(): string[] {
	if (process.platform === "darwin") return ["/Volumes"];
	const user = os.userInfo().username;
	return [path.join("/media", user), path.join("/run/media", user), "/media"];
}

// E:, E:\, /Volumes/X, ./x — not a bare label.
function looksLikePath(volume: string): boolean {
	return /^[a-zA-Z]:[\\/]?$/.test(volume) || /[\\/]/.test(volume);
}

function exists(file: string): Promise<boolean> {
	return access(/^[a-zA-Z]:$/.test(file) ? `${file}\\` : file).then(() => true, () => false);
}

// Windows: the removable volumes with a drive letter — the letter's root.
async function listOnWindows(): Promise<VolumeDTO[]> {
	const { stdout } = await run("powershell.exe", [
		"-NoProfile", "-NonInteractive", "-Command",
		"Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Removable' } | Select-Object DriveLetter,FileSystemLabel | ConvertTo-Json -Compress",
	], { windowsHide: true }).catch(() => ({ stdout: "" }));
	if (!stdout.trim()) return [];
	type Row = { DriveLetter: string; FileSystemLabel: string | null };
	const parsed = JSON.parse(stdout) as Row | Row[];
	return (Array.isArray(parsed) ? parsed : [parsed]).map(v => ({ label: v.FileSystemLabel ?? "", mount: `${v.DriveLetter}:\\` }));
}
