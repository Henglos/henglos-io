/**
 * The packages `hio create` writes: a complete board or component, ready to
 * lint, edit and publish. Each template is a map of relative path → content.
 */

/** The platform versions a new package says it works with. */
const PLATFORM_RANGE = "^1.0.0";

/** What a template is filled in with. */
export type TemplateOptions = {
	/** The name shown in the studio, e.g. "Water Sensor". */
	displayName: string;
	/** The npm package name, e.g. "@you/component-water-sensor". */
	packageName: string;
};

/** A template's files, by path relative to the package's folder. */
export type TemplateFiles = Record<string, string>;

/** The kinds of package `hio create` can write. */
export const TEMPLATE_KINDS = ["component", "board"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Writes the files of a package of `kind`. */
export function renderTemplate(kind: TemplateKind, options: TemplateOptions): TemplateFiles {
	return kind === "component" ? componentTemplate(options) : boardTemplate(options);
}

/**
 * `"water sensor"`, `"water-sensor"` or `"WaterSensor"` → the name in the
 * studio: `"Water Sensor"`. A name with spaces or capitals is kept as it is.
 */
export function toDisplayName(name: string): string {
	const trimmed = name.trim();
	if (/\s/.test(trimmed) && /[A-Z]/.test(trimmed)) return trimmed;
	return trimmed
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map(word => word[0]!.toUpperCase() + word.slice(1))
		.join(" ");
}

/** `"Water Sensor"` → `"water-sensor"`: for folder and package names. */
export function toSlug(name: string): string {
	return name
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * A component with one action (Read) and one trigger (Change Trigger) on a
 * digital pin — the two kinds of script a component can have, both working.
 */
function componentTemplate({ displayName, packageName }: TemplateOptions): TemplateFiles {

	// What the studio sends to the board: "<component>/<action>", lowercased.
	const component = displayName.toLowerCase();

	return {

		"package.json": json({
			name: packageName,
			version: "1.0.0",
			description: `${displayName} component for Henglos IO`,
			// How Henglos IO packages are found on npm.
			keywords: ["henglosio", "henglosio-component"],
			license: "UNLICENSED",
			type: "module",
			exports: {
				"./manifest.yaml": "./manifest.yaml",
				"./package.json": "./package.json",
			},
			files: ["src/**/*.py", "manifest.yaml"],
		}),

		"manifest.yaml": `kind: component
name: ${displayName}
schemaVersion: 1

dependences:
  # The platform versions it works with (a semver range).
  platform: ${PLATFORM_RANGE}
  # What it needs of the board, if anything — e.g. [wifi]. A board without it
  # never runs the component.
  # capabilities: [wifi]

schema:

  displayName: ${displayName}
  description: >
    What ${displayName} does, in a sentence or two — shown in the studio's library.

  # Each action is a node of the workflow. Its script registers the name
  # "<component>/<action>" in lowercase: "${component}/read".
  actions:

    - displayName: Read
      description: Reads the pin and publishes whether it's high.
      # A Lucide icon (lucide.dev/icons), by its name there.
      icon: scan-line
      script: src/read.py
      # The node's fields. A config's id on the board is "<action>/<config>",
      # lowercased: "read/pin".
      configurations:
        - displayName: Pin
          description: The board pin it reads.
          type: pin
          from: board
          filterBy: [digital_in]
          required: true
      # What it publishes — what other actions can bind to.
      outputSchema:
        - name: value
          type: bool
          description: Whether the pin is high.

  # A trigger starts a branch of the flow on its own, when something happens.
  triggers:

    - displayName: Change Trigger
      description: Runs its branch when the pin changes.
      icon: zap
      script: src/change_trigger.py
      configurations:
        - displayName: Pin
          description: The board pin it watches.
          type: pin
          from: board
          filterBy: [digital_in]
          required: true
      outputSchema:
        - name: value
          type: bool
          description: The pin right after the change.
`,

		"src/read.py": `from machine import Pin

from henglosio.sdk import HIOAction, action, SUCCESS, FALLBACK


# ${displayName} / Read — reads the pin and publishes whether it's high.
#
# Names (from the manifest's displayNames, lowercased):
#   action   "${component}/read"
#   configs  "read/pin"
#   output   "value" (bool)
@action("${component}/read")
class ReadAction(HIOAction):

	async def execute(self, context):

		pin = context.get("read/pin")
		if pin is None:
			# Goes out the node's Fallback.
			return FALLBACK

		context.set("value", Pin(int(pin), Pin.IN).value() != 0)
		return SUCCESS
`,

		"src/change_trigger.py": `from machine import Pin

from henglosio.sdk import HIOTrigger, trigger


# ${displayName} / Change Trigger — runs its branch when the pin changes.
#
# The board calls poll() from its main loop while the workflow runs: return
# True to run the branch once. arm() starts watching, disarm() stops.
#
# Names:
#   trigger  "${component}/change trigger"
#   configs  "change trigger/pin"
#   output   "value" (bool)
@trigger("${component}/change trigger")
class ChangeTrigger(HIOTrigger):

	def initialize(self) -> None:
		self._pin = None
		self._last = None

	def arm(self, context) -> None:
		pin = context.get("change trigger/pin")
		if pin is None:
			raise ValueError("no Pin")
		self._pin = Pin(int(pin), Pin.IN)
		self._last = self._pin.value()

	def poll(self, context) -> bool:
		value = self._pin.value()
		if value == self._last:
			return False
		self._last = value
		context.set("value", value != 0)
		return True

	def disarm(self) -> None:
		self._pin = None
`,

		"README.md": `# ${displayName}

\`${packageName}\` — a Henglos IO component.

What ${displayName} does, in a sentence or two.

## What it can do

- **Read** — reads a pin and tells whether it's high.

## Triggers

- **Change Trigger** — runs a branch when the pin changes.

## Publishing

\`\`\`bash
hio lint                                          # check the package
npm publish                                       # the public registry
npm publish --registry http://localhost:3000/api/packages/henglosio/npm/   # the dev Gitea
\`\`\`

Then install it from the studio's library by its package name.
`,
	};
}

// ── Board ────────────────────────────────────────────────────────────────────

/**
 * A board: its manifest (firmware) and its schema (pins, connection), set up
 * for a classic ESP32 — the values to change for another board are marked.
 */
function boardTemplate({ displayName, packageName }: TemplateOptions): TemplateFiles {
	return {

		"package.json": json({
			name: packageName,
			version: "1.0.0",
			description: `${displayName} board for Henglos IO`,
			// How Henglos IO packages are found on npm.
			keywords: ["henglosio", "henglosio-board"],
			license: "UNLICENSED",
			type: "module",
			exports: {
				"./manifest.yaml": "./manifest.yaml",
				"./package.json": "./package.json",
			},
			files: ["manifest.yaml", "src"],
		}),

		"manifest.yaml": `kind: board
name: ${displayName}
schemaVersion: 1

dependences:
  # The platform versions it works with (a semver range).
  platform: ${PLATFORM_RANGE}

ui:
  # Its pins and connection. The folder is up to you.
  schema: ./src/board.schema.yaml

# What it offers besides its pins: wifi, bluetooth, ethernet, can, usb-host.
# Components that need one only run on boards that list it.
capabilities: [wifi, bluetooth]

# How MicroPython gets onto it. Set up for a classic ESP32.
firmware:
  # The MicroPython version it runs: the platform compiles for exactly it.
  micropython: 1.29.0
  # The Docker image the build and the flash run in. Any image with Node 24+,
  # hio and Python 3 with pip; the official ones are henglosio/workbench-*.
  image: henglosio/workbench-esp32:1.0.0
  # What builds and writes the firmware. The folder is up to you.
  script: ./src/firmware.ts

# Parameters of the firmware, if it has any: the studio shows a form, and the
# script reads them from ctx.options, as text. Not for secrets.
# options:
#   - key: FLASH_SIZE
#     displayName: Flash size
#     description: The module's flash size.
#     type: select          # integer (with min, max), boolean or select (with choices)
#     default: 4MB
#     choices: [4MB, 8MB, 16MB]
`,

		"src/firmware.ts": `import type { BoardFirmware, FirmwareBuildContext } from "@henglosio/runner";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── The board ────────────────────────────────────────────────────────────────
// MicroPython's port and board (its folder under ports/<port>/boards), and the
// chip as ESP-IDF and esptool name it. OFFSET is where the image starts in
// flash — the bootloader's place: 0x1000 on the classic ESP32, 0x0 on the S3/C3.
const PORT = "esp32";
const BOARD = "ESP32_GENERIC";
const CHIP = "esp32";
const OFFSET = "0x1000";

// The stock MicroPython, written when the board has no firmware of its own.
const STOCK = "https://micropython.org/resources/firmware/ESP32_GENERIC-20260824-v1.29.0.bin";

// Appended to the board's mpconfigboard.h. MICROPY_PY_TSTRINGS on: MicroPython
// 1.29 lists its "string" module (t-strings) in the built-in module table
// whatever the board's feature level, but only builds it from FULL_FEATURES up
// (ESP32_GENERIC is EXTRA_FEATURES) — left off, the link fails on mp_module_string.
const CONFIG_OVERRIDES = [
	"",
	"// ── HenglosIO ──────────────────────────────────────────────────────────────",
	"#ifndef MICROPY_PY_TSTRINGS",
	"#define MICROPY_PY_TSTRINGS (1)",
	"#endif",
	"",
].join("\\n");

const MICROPYTHON_REPO = "https://github.com/micropython/micropython.git";
const ESP_IDF_REPO = "https://github.com/espressif/esp-idf.git";

type Context = Pick<FirmwareBuildContext, "run" | "log">;

export default {

	// MicroPython with the runtime frozen in, so it runs from flash and the RAM is
	// left to the workflow (a runtime loaded from .mpy files costs ~75 KB of an
	// ESP32's ~110). Same version and layout as STOCK, so it's written at the same
	// offset, and the board's filesystem stays.
	//
	// Everything slow happens once per version, in ctx.cache (shared by every
	// workflow's container, so under a lock): the MicroPython checkout, ESP-IDF
	// (the version MicroPython's CI uses) and its toolchain for the chip. The
	// build itself is incremental.
	async build(ctx) {
		fs.mkdirSync(ctx.cache, { recursive: true });

		await withLock(path.join(ctx.cache, "firmware.lock"), async () => {

			const micropython = path.join(ctx.cache, "micropython", "v" + ctx.micropython);
			await cloneOnce(ctx, "MicroPython v" + ctx.micropython, MICROPYTHON_REPO, "v" + ctx.micropython, micropython, []);

			const idfVersion = idfVersionFor(micropython);
			const idf = path.join(ctx.cache, "esp-idf", idfVersion);
			// install.sh and export.sh read it — ctx.run passes this process's environment on.
			process.env["IDF_TOOLS_PATH"] = path.join(ctx.cache, "espressif");

			const ready = path.join(idf, ".hio-ready-" + CHIP);
			if (!fs.existsSync(ready)) {
				await cloneOnce(ctx, "ESP-IDF " + idfVersion + " (once — a few minutes)", ESP_IDF_REPO, idfVersion, idf, ["--recursive", "--shallow-submodules"]);
				await ctx.log("[firmware] installing ESP-IDF's " + CHIP + " toolchain (once)\\n");
				await ctx.run(path.join(idf, "install.sh"), [CHIP]);
				fs.writeFileSync(ready, "");
			}

			await ctx.log("[firmware] MicroPython v" + ctx.micropython + " · " + PORT + "/" + BOARD + " · ESP-IDF " + idfVersion + "\\n");

			const jobs = "-j" + os.availableParallelism();
			const portDir = path.join(micropython, "ports", PORT);
			await withIdf(ctx, idf, "make", ["-C", path.join(micropython, "mpy-cross"), jobs]);
			await withIdf(ctx, idf, "make", ["-C", portDir, "BOARD=" + BOARD, "submodules"]);

			const boardDir = stageBoard(ctx.cache, ctx.micropython, path.join(portDir, "boards", BOARD));
			const buildDir = path.join(ctx.cache, "build", "v" + ctx.micropython + "-" + PORT + "-" + BOARD);
			await withIdf(ctx, idf, "make", ["-C", portDir, "BOARD_DIR=" + boardDir, "BUILD=" + buildDir, "FROZEN_MANIFEST=" + ctx.freezeManifest, jobs]);

			fs.copyFileSync(path.join(buildDir, "firmware.bin"), ctx.firmwareOutput);

		});
	},

	// One esptool run, one connection: erase-flash and then write-flash would reset
	// the chip in between, and the write has to bring it back into its bootloader
	// through the tunnel — when that fails, the board is left erased. --erase-all
	// erases within the same session, right before writing.
	async flash(ctx) {
		let firmware = ctx.firmware ?? STOCK;
		if (/^https?:\\/\\//.test(firmware)) {
			firmware = await downloadOnce(ctx, firmware, path.join(ctx.cache, "firmware", path.basename(firmware.split("?")[0]!)));
		}

		await ctx.run("esptool", [
			"--chip", CHIP,
			"--port", ctx.serialUrl,
			"--baud", String(ctx.baudrate),
			"write-flash",
			...(ctx.erase ? ["--erase-all"] : []),
			"-z", OFFSET, firmware,
		]);
	},

} satisfies BoardFirmware;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Runs \`fn\` holding an exclusive lock on \`file\` — flock(1), so it holds across
// the containers sharing the cache, and is released if this process dies.
async function withLock(file: string, fn: () => Promise<void>): Promise<void> {
	const holder = spawn("flock", [file, "sh", "-c", "echo locked; exec cat"], { stdio: ["pipe", "pipe", "inherit"] });
	const exited = new Promise<void>(resolve => holder.on("close", () => resolve()));

	await new Promise<void>((resolve, reject) => {
		holder.stdout.on("data", (chunk: Buffer) => {
			if (chunk.toString().includes("locked")) resolve();
		});
		holder.on("error", reject);
		holder.on("close", code => reject(new Error("flock exited with code " + code + " before taking the lock")));
	});

	try {
		await fn();
	} finally {
		holder.stdin.end();      // \`cat\` ends, flock lets go
		await exited;
	}
}

// Clones \`ref\` of \`repo\` into \`dir\`, unless it's there already — through a
// .partial folder, so an interrupted clone is never mistaken for a finished one.
async function cloneOnce(ctx: Context, label: string, repo: string, ref: string, dir: string, extra: string[]): Promise<void> {
	if (fs.existsSync(path.join(dir, ".git"))) return;
	await ctx.log("[firmware] fetching " + label + "\\n");
	const partial = dir + ".partial";
	fs.rmSync(partial, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(dir), { recursive: true });
	await ctx.run("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, ...extra, repo, partial]);
	fs.renameSync(partial, dir);
}

// The ESP-IDF a MicroPython checkout builds with: its CI's newest (1.24+: the
// esp32 workflow's IDF_NEWEST_VER), the README's recommended one, or — older
// versions — what tools/ci.sh pins.
function idfVersionFor(micropython: string): string {
	const version = /v\\d+\\.\\d+(\\.\\d+)?/;
	const read = (file: string) => {
		const full = path.join(micropython, file);
		return fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : "";
	};
	const from = (text: string, line: RegExp) => {
		const match = text.split("\\n").find(l => line.test(l))?.match(version);
		return match?.[0];
	};

	const found = from(read(".github/workflows/ports_esp32.yml"), /IDF_NEWEST_VER:/)
		?? from(read("ports/esp32/README.md"), /recommended version of ESP-IDF/i)
		?? from(read("tools/ci.sh"), /IDF_VER=v/);
	if (!found) throw new Error("Can't tell which ESP-IDF this MicroPython builds with.");
	return found;
}

// Runs a command with ESP-IDF's environment (its export.sh) — the arguments go
// to bash as positional parameters, never as part of the script.
function withIdf(ctx: Context, idf: string, command: string, args: string[]): Promise<void> {
	return ctx.run("bash", ["-c", ". \\"$0/export.sh\\" > /dev/null && exec \\"$@\\"", idf, command, ...args]);
}

// The board's folder, copied into the cache with CONFIG_OVERRIDES appended to
// its mpconfigboard.h. Replaced only when it changed: new files would make the
// incremental build compile everything again.
function stageBoard(cache: string, micropython: string, source: string): string {
	const target = path.join(cache, "boards", "v" + micropython + "-" + PORT + "-" + BOARD);
	const staged = target + ".staged";

	fs.rmSync(staged, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.cpSync(source, staged, { recursive: true });
	fs.appendFileSync(path.join(staged, "mpconfigboard.h"), CONFIG_OVERRIDES);

	if (sameTree(staged, target)) {
		fs.rmSync(staged, { recursive: true, force: true });
	} else {
		fs.rmSync(target, { recursive: true, force: true });
		fs.renameSync(staged, target);
	}
	return target;
}

// Whether two folders hold the same files with the same contents.
function sameTree(a: string, b: string): boolean {
	if (!fs.existsSync(b)) return false;
	const files = (dir: string) => (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
		.filter(entry => entry.isFile())
		.map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)))
		.sort();
	const left = files(a);
	const right = files(b);
	return left.length === right.length
		&& left.every((file, i) => file === right[i] && fs.readFileSync(path.join(a, file)).equals(fs.readFileSync(path.join(b, file))));
}

// Downloads \`url\` to \`file\` once — through a .partial file, so a cut download
// is never used.
async function downloadOnce(ctx: Context, url: string, file: string): Promise<string> {
	if (fs.existsSync(file)) return file;
	await ctx.log("[flash] downloading " + url + "\\n");
	const response = await fetch(url);
	if (!response.ok) throw new Error("Downloading " + url + " failed: HTTP " + response.status);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file + ".partial", Buffer.from(await response.arrayBuffer()));
	fs.renameSync(file + ".partial", file);
	return file;
}
`,

		"src/board.schema.yaml": `name: ${displayName}
description: What the board is, in a sentence — shown when picking a board.

# Every pin a workflow can use, and what each one can do: digital_in,
# digital_out, analog_in, analog_out, pwm, touch, uart… Components only offer
# the pins that fit (a Servo, the pwm ones).
pins:
  - gpio: 2
    type: [digital_in, digital_out, analog_in, pwm, touch]
    displayName: GPIO2
  - gpio: 4
    type: [digital_in, digital_out, analog_in, pwm, touch]
    displayName: GPIO4
  - gpio: 5
    type: [digital_in, digital_out, pwm]
    displayName: GPIO5
  - gpio: 25
    type: [digital_in, digital_out, analog_in, analog_out, pwm]
    displayName: GPIO25
  - gpio: 34
    type: [digital_in, analog_in]
    displayName: GPIO34

# How the driver talks to it.
connection:
  serial:
    # The baud rates it can use. 115200 first: the one the driver tries first.
    baudrates: [115200, 9600, 57600, 230400, 460800, 921600]
`,

		"README.md": `# ${displayName}

\`${packageName}\` — a Henglos IO board.

What the board is, in a sentence or two.

## What it brings

- Its pins, and what each one can do.
- Wi-Fi and Bluetooth.
- Its firmware: MicroPython, with the Henglos IO platform.

## Publishing

\`\`\`bash
hio lint                                          # check the package
npm publish                                       # the public registry
npm publish --registry http://localhost:3000/api/packages/henglosio/npm/   # the dev Gitea
\`\`\`

Then install it from the studio's library by its package name.
`,
	};
}

function json(value: unknown): string {
	return `${JSON.stringify(value, null, "\t")}\n`;
}
