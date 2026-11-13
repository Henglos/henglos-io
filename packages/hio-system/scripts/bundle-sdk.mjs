// Puts the sdk (packages/hio-sdk) into hio/sdk for the published tarball, and
// takes it out again. Run by npm as prepack / postpack (`--clean`): in dev the
// sdk comes from the uv workspace, but the board builds from the tarball alone,
// which must hold the whole `hio` tree. The sdk's version is recorded in the
// tarball's package.json under `hio.sdk`.

import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SDK = path.resolve(ROOT, "..", "hio-sdk");
const TARGET = path.join(ROOT, "hio", "sdk");
const PACKAGE_JSON = path.join(ROOT, "package.json");

const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf-8"));

if (process.argv.includes("--clean")) {
	await rm(TARGET, { recursive: true, force: true });
	delete pkg.hio;
} else {
	const pyproject = await readFile(path.join(SDK, "pyproject.toml"), "utf-8");
	const version = /^version\s*=\s*"([^"]+)"/m.exec(pyproject)?.[1];
	if (!version) throw new Error(`No version in ${path.join(SDK, "pyproject.toml")}.`);

	await rm(TARGET, { recursive: true, force: true });
	await cp(path.join(SDK, "src", "hio", "sdk"), TARGET, {
		recursive: true,
		filter: (source) => path.basename(source) !== "__pycache__",
	});
	pkg.hio = { sdk: version };
}

await writeFile(PACKAGE_JSON, `${JSON.stringify(pkg, null, "\t")}\n`);
