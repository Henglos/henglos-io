import fs from "fs/promises";
import path from "path";
import { ManifestService } from "../manifests/service.js";
import type { BoardPackage, ComponentPackage, PlatformPackage } from "../manifests/types.js";

const manifests = new ManifestService();

// Where a package keeps its manifest.yaml: at its root, or under workspace/
// (the older layout, still used by board packages). The folder it's in is the
// package's own `path` — every relative path in the manifest (a component
// action's `script`, a board's `build.script`) resolves against it.
const MANIFEST_LOCATIONS = ["manifest.yaml", path.join("workspace", "manifest.yaml")];

/** A package's manifest.yaml — at its root, or in workspace/. Null when it has none. */
export async function locateManifest(packagePath: string): Promise<string | null> {
	for (const relative of MANIFEST_LOCATIONS) {
		const candidate = path.join(packagePath, relative);
		if (await fs.stat(candidate).then(s => s.isFile(), () => false)) return candidate;
	}
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

	// A board package: its manifest (hardware only — pins and firmware).
	async validateBoard(packagePath: string): Promise<BoardPackage | null> {
		try {
			const manifestPath = await locateManifest(packagePath);
			if (!manifestPath) return null;
			const manifest = await manifests.loadAs(manifestPath, "board");
			return { ...manifest, path: path.dirname(manifestPath) };
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

	// The platform package: the runtime (hio/ next to its manifest) plus the
	// Runner script that builds it.
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
