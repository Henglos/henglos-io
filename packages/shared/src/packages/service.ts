import fs from "fs/promises";
import path from "path";
import { ManifestService } from "../manifests/service.js";
import type { BoardPackage, ComponentPackage, PlatformPackage } from "../manifests/types.js";

const manifests = new ManifestService();

/**
 * A package's manifest.yaml, at its root or under workspace/. Null when it has none. Every relative
 * path in it (a component action's `script`, a board's `firmware.script` and
 * `ui.schema`) resolves against that folder, and can be in any folder under it.
 */
export async function locateManifest(packagePath: string): Promise<string | null> {
	const candidate = path.join(packagePath, "manifest.yaml");
	if (await fs.stat(candidate).then(s => s.isFile(), () => false)) return candidate;
	const workspaceCandidate = path.join(packagePath, "workspace", "manifest.yaml");
	if (await fs.stat(workspaceCandidate).then(s => s.isFile(), () => false)) return workspaceCandidate;
	return null;
}

// ── PackageService ────────────────────────────────────────────────────────────

export class PackageService {

	async validate(packagePath: string): Promise<BoardPackage | ComponentPackage | PlatformPackage | null> {
		const manifestPath = await locateManifest(packagePath);
		if (!manifestPath) return null;
		const manifest = await manifests.load(manifestPath).catch(() => null);
		switch (manifest?.kind) {
			case "board": return this.validateBoard(packagePath);
			case "component": return this.validateComponent(packagePath);
			case "platform": return this.validatePlatform(packagePath);
			default: return null;
		}
	}

	// A board package: its manifest (pins and firmware) plus the script that
	// builds and writes its firmware.
	async validateBoard(packagePath: string): Promise<BoardPackage | null> {
		try {
			const manifestPath = await locateManifest(packagePath);
			if (!manifestPath) return null;
			const manifest = await manifests.loadAs(manifestPath, "board");
			const root = path.dirname(manifestPath);
			await fs.access(path.join(root, manifest.firmware.script));
			return { ...manifest, path: root };
		} catch {
			return null;
		}
	}

	// A component package: its manifest — every action's `script` is checked
	// when it's built, against `path`.
	async validateComponent(packagePath: string): Promise<ComponentPackage | null> {
		try {
			const manifestPath = await locateManifest(packagePath);
			if (!manifestPath) return null;
			const manifest = await manifests.loadAs(manifestPath, "component");
			return { ...manifest, path: path.dirname(manifestPath) };
		} catch {
			return null;
		}
	}

	// The platform package: its manifest plus the build script that compiles it.
	async validatePlatform(packagePath: string): Promise<PlatformPackage | null> {
		try {
			const manifestPath = await locateManifest(packagePath);
			if (!manifestPath) return null;
			const manifest = await manifests.loadAs(manifestPath, "platform");
			const root = path.dirname(manifestPath);
			await fs.access(path.join(root, manifest.build.script));
			return { ...manifest, path: root };
		} catch {
			return null;
		}
	}

}
