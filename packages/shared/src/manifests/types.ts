import zod from "zod";
import {
	BoardManifestSchema,
	ComponentManifestSchema,
	ManifestSchema,
	PlatformManifestSchema,
} from "./schema.js";

/** A component's manifest.yaml, parsed. */
export type ComponentManifest = zod.infer<typeof ComponentManifestSchema>;
/** A board's manifest.yaml, parsed. */
export type BoardManifest = zod.infer<typeof BoardManifestSchema>;
/** The platform's manifest.yaml, parsed. */
export type PlatformManifest = zod.infer<typeof PlatformManifestSchema>;
/** Any manifest.yaml, parsed — told apart by `kind`. */
export type Manifest = zod.infer<typeof ManifestSchema>;

// ── Package types (manifest + resolved path) ──────────────────────────────────

/** A board package: its manifest, and the folder it's in. */
export type BoardPackage = { path: string } & BoardManifest;
/** A component package: its manifest, and the folder it's in. */
export type ComponentPackage = { path: string } & ComponentManifest;
/** The platform package: its manifest, and the folder it's in. */
export type PlatformPackage = { path: string } & PlatformManifest;
