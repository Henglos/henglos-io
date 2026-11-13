// Dev helper: push the on-disk board/component schemas from
// packages/library/{boards,components}/* into the local `packages` table.
//
// Why this exists: package schemas only ever reach the DB through
// PackageRegistryService.fetchPackage (the registry), and `packages` rows are
// frozen by name+version — AddPackage reuses an existing row. So editing a
// component's manifest.yaml `schema:` key (or, for boards, the separate
// *.schema.yaml it points to via ui.schema) has no effect on the studio until
// the package is republished with a bumped version. During local development
// that round-trip is painful; this script short-circuits it.
//
// Usage (from apps/hosting):
//   node scripts/resync-local-schemas.mjs            # all local packages
//   node scripts/resync-local-schemas.mjs Servo ESP32  # only these (matches name or spec)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Database from "better-sqlite3";
import { BoardSchema, ComponentSchema } from "@henglosio/workflow";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const packagesRoot = path.join(repoRoot, "packages/library");

const dbUrl = (() => {
	const envPath = path.join(here, "..", ".env");
	const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
	const match = raw.match(/^HIO_DATABASE_URL=(.+)$/m);
	return (match?.[1] ?? "./data/database.sqlite").trim();
})();

const filters = process.argv.slice(2).map((s) => s.toLowerCase());
const wanted = (name, spec) =>
	filters.length === 0 ||
	filters.some((f) => name.toLowerCase().includes(f) || spec.toLowerCase().includes(f));

const db = new Database(path.resolve(path.join(here, ".."), dbUrl));

const workspaces = [];
for (const kind of ["boards", "components"]) {
	const dir = path.join(packagesRoot, kind);
	if (!fs.existsSync(dir)) continue;
	for (const entry of fs.readdirSync(dir)) {
		const ws = path.join(dir, entry);
		const manifestPath = path.join(ws, "manifest.yaml");
		if (fs.existsSync(manifestPath)) workspaces.push({ entry, ws, manifestPath });
	}
}

let updated = 0;
let skipped = 0;

for (const { entry, ws, manifestPath } of workspaces) {
	const manifest = YAML.parse(fs.readFileSync(manifestPath, "utf8"));

	// Board still ships its schema as a separate file pointed to by ui.schema; component inlines it under manifest.schema.
	let parsed;
	// The file the schema was read from — for the log line.
	let schemaPath = manifestPath;
	if (manifest.kind === "board") {
		const schemaFile = manifest?.ui?.schema;
		if (!schemaFile) { console.warn(`- ${entry}: no ui.schema in manifest, skipped`); skipped++; continue; }

		schemaPath = path.join(ws, schemaFile);
		if (!fs.existsSync(schemaPath)) { console.warn(`- ${entry}: ${schemaFile} not found, skipped`); skipped++; continue; }

		parsed = YAML.parse(fs.readFileSync(schemaPath, "utf8"));
	} else {
		if (!manifest.schema) { console.warn(`- ${entry}: no schema in manifest, skipped`); skipped++; continue; }
		parsed = manifest.schema;
	}

	// The manifest's capabilities go into the schema — as PackageRegistryService does.
	const capabilities = manifest.kind === "board" ? manifest.capabilities : manifest.dependences?.capabilities;
	if (capabilities) parsed = { ...parsed, capabilities };

	const validator = manifest.kind === "board" ? BoardSchema : ComponentSchema;
	const result = validator.safeParse(parsed);
	if (!result.success) {
		console.error(`- ${entry}: schema invalid (${manifest.kind}):`);
		console.error(JSON.stringify(result.error.issues, null, 2));
		skipped++;
		continue;
	}

	const row = db
		.prepare("select id, name, spec, version from packages where name = ? or spec = ?")
		.get(manifest.name, `@henglosio/${manifest.kind}-${entry.toLowerCase()}`);

	if (!row) { console.warn(`- ${entry}: not installed in this DB, skipped`); skipped++; continue; }
	if (!wanted(row.name, row.spec)) { skipped++; continue; }

	db.prepare("update packages set schema = ? where id = ?").run(JSON.stringify(result.data), row.id);
	console.log(`✓ ${row.name} (${row.spec}@${row.version}) <- ${path.relative(repoRoot, schemaPath)}`);
	updated++;
}

console.log(`\n${updated} updated, ${skipped} skipped. Reload any open workflow in the studio.`);
