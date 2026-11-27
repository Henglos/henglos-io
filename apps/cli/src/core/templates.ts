/**
 * The packages `hio create` writes: a complete board or component, ready to
 * lint, edit and publish. Each template is a map of relative path → content.
 */

/** The platform versions a new package says it works with. */
const PLATFORM_RANGE = "^1.4.0";

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
 * A board: its manifest (firmware) and its schema (pins, connection) — a
 * starting point for any board that runs MicroPython.
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
capabilities: []

# How MicroPython gets onto it.
firmware:
  # The MicroPython version it runs — the runtime is compiled for exactly it,
  # with the mpy-cross the script's prepare returns.
  micropython: 1.29.0
  # The Docker image the build and the flash run in: any image with Node 24+,
  # plus the tools your firmware script uses (git, make and a C compiler to
  # build mpy-cross).
  image: your-org/your-board-workbench:1.0.0
  # What builds and writes the firmware. The folder is up to you.
  script: ./src/firmware.ts
  # How the firmware can be written, the preferred first — the studio offers
  # these, and the script gets the one picked as ctx.method: serial, uf2.
  methods: [serial]

# Parameters of the firmware, if it has any: the studio shows a form, and the
# script reads them from ctx.options, as text. Not for secrets.
# options:
#   - key: FLASH_SIZE
#     displayName: Flash size
#     description: The module's flash size.
#     type: select          # integer (with min, max), boolean or select (with choices)
#     scope: build          # what a change redoes: prepare, build (the default) or runtime
#     default: 4MB
#     choices: [4MB, 8MB, 16MB]
`,

		"src/firmware.ts": `import type { BoardFirmware, BoardBuildContext, BoardFlashContext, BoardPrepareContext } from "@henglosio/runner";
import fs from "node:fs";
import path from "node:path";

// The MicroPython the board runs — the official one, or a fork with a port of
// your own.
const MICROPYTHON_REPO = "https://github.com/micropython/micropython.git";

// How MicroPython gets onto the board — run by hio in the manifest's
// firmware.image. ctx.run(command, args) runs a command of that image, ctx.log
// reports to the studio, ctx.cache is kept between runs and ctx.options holds
// the board's options (the manifest's \`options\`).
export default {

	// Sets up what build and flash need — sources, toolchains — in ctx.cache (the
	// container is thrown away, the cache is kept), and returns the mpy-cross of
	// the board's MicroPython: the runtime and the components are compiled with
	// it. Runs once, until it succeeds, for this script, ctx.micropython and the
	// options with \`scope: prepare\`; the studio shows it as its own phase.
	async prepare(ctx: BoardPrepareContext) {
		const micropython = path.join(ctx.cache, "micropython", "v" + ctx.micropython);
		if (!fs.existsSync(path.join(micropython, ".git"))) {
			await ctx.run("git", ["clone", "--depth", "1", "--branch", "v" + ctx.micropython, MICROPYTHON_REPO, micropython]);
		}
		await ctx.run("make", ["-C", path.join(micropython, "mpy-cross")]);
		return { mpyCross: path.join(micropython, "mpy-cross", "build", "mpy-cross") };
	},

	// Optional — remove it to put the runtime on the board's filesystem as .mpy
	// files: builds MicroPython ctx.micropython with ctx.freezeManifest (the
	// port's frozen modules plus the runtime; ctx.runtimeManifest has the runtime
	// alone) frozen in, into ctx.firmwareOutput.
	async build(ctx: BoardBuildContext) {
	},

	// Writes ctx.firmware — or, when there's none, the board's stock MicroPython —
	// erasing the flash first when ctx.erase, by ctx.method (one of the manifest's
	// firmware.methods, picked in the studio) through ctx.send: "serial" (write
	// gets the port's url, at ctx.baudrate) or "uf2" (the driver copies the file
	// to the board's drive). Left empty, the board must already run MicroPython
	// ctx.micropython.
	async flash(ctx: BoardFlashContext) {
	},

} satisfies BoardFirmware;
`,

		"src/board.schema.yaml": `name: ${displayName}
description: What the board is, in a sentence — shown when picking a board.

# Every pin a workflow can use, and what each one can do: digital_in,
# digital_out, analog_in, analog_out, pwm, touch, uart… Components only offer
# the pins that fit (a Servo, the pwm ones).
pins:
  - gpio: 0
    type: [digital_in, digital_out, pwm]
    displayName: GPIO0

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
