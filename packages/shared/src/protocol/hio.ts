import zod from "zod";

// A workflow exported to a file — `<name>.hio`, a zip holding:
//
//   manifest.json   HioManifest: what the workflow is and the packages it needs
//   workflow.json   the workflow's data, portable: package ids are refs into
//                   manifest.packages, and the board's and components' schemas
//                   are left out (they come back from their npm packages)
//
// No package code travels in it — importing installs the board and the
// components from their registries, at the exact versions listed.

export const HIO_FORMAT = "henglosio/workflow";
/** The .hio format's version — an import refuses a newer one. */
export const HIO_FORMAT_VERSION = 1;
/** A .hio file's extension. */
export const HIO_EXTENSION = ".hio";
/** The .hio's manifest, at the zip's root (or in its one folder, when zipped again by hand). */
export const HIO_MANIFEST_FILE = "manifest.json";
/** The .hio's workflow, at the zip's root. */
export const HIO_WORKFLOW_FILE = "workflow.json";
// Files attached to the workflow's configs, as files/<sha256> — the configs
// keep their values (name, sha256...), the import gives them new ids.
export const HIO_FILES_DIR = "files/";
// The largest .hio import accepts, zipped and unzipped.
export const HIO_MAX_BYTES = 8 * 1024 * 1024;

/** A package a .hio needs, at its exact version — installed from its registry on import. */
export const HioPackageRefSchema = zod.object({
	/** What workflow.json uses in place of the package id. */
	ref: zod.string().min(1),
	type: zod.enum(["board", "component"]),
	/** The npm package name. */
	spec: zod.string().min(1),
	version: zod.string().min(1),
	/** The registry it was installed from; absent: the default one. */
	registry: zod.string().optional(),
});

/** A .hio's manifest.json: what the workflow is, its platform, and the packages it needs. */
export const HioManifestSchema = zod.object({
	format: zod.literal(HIO_FORMAT),
	formatVersion: zod.number().int().positive(),
	exportedAt: zod.string(),
	name: zod.string(),
	description: zod.string(),
	/** The @henglosio/hio-system version it builds against. */
	platform: zod.string().min(1),
	packages: zod.array(HioPackageRefSchema),
});

/** POST /workflows/import — the new workflow, and the packages the import installed. */
export const ImportWorkflowOutSchema = zod.object({
	id: zod.string(),
	/** The name it got — suffixed when the account already had one by that name. */
	name: zod.string(),
	/** Packages the import added to the account, as name@version. */
	installed: zod.array(zod.string()),
	/**
	 * What didn't fit and was imported anyway — a platform that isn't
	 * published here, a package that doesn't support the workflow's platform.
	 */
	warnings: zod.array(zod.string()),
});

/** A package a .hio needs, at its exact version — installed from its registry on import. */
export type HioPackageRef = zod.infer<typeof HioPackageRefSchema>;
/** A .hio's manifest.json: what the workflow is, its platform, and the packages it needs. */
export type HioManifest = zod.infer<typeof HioManifestSchema>;
/** POST /workflows/import — the new workflow, and the packages the import installed. */
export type ImportWorkflowOut = zod.infer<typeof ImportWorkflowOutSchema>;
