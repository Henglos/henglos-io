// Copies basedpyright's browser worker (one prebuilt ~18 MB file) into
// public/pyright/, so the code editor loads it as a plain static Worker
// instead of having Next re-bundle it. Runs before dev/build; the copy is
// gitignored — browser-basedpyright in package.json is the source of truth.

import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("browser-basedpyright/package.json")), "dist", "pyright.worker.js");
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "pyright", "pyright.worker.js");

const same = (() => {
	try {
		const a = statSync(source);
		const b = statSync(target);
		return a.size === b.size && a.mtimeMs <= b.mtimeMs;
	} catch {
		return false;
	}
})();

if (!same) {
	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(source, target);
	console.log(`[pyright] worker copied to ${target}`);
}
