# Runner

`@henglosio/runner`

The builder that turns a workflow into something a board can run.

## What it does

- The contract a board's firmware script is written against (`BoardFirmware`).
- The line from the build container to the driver: logs, phases, and the flash broker.
- What a build leaves for the driver (`BUILD_OUTPUT`, `FirmwareInfo`).

## Where it fits

The platform is the runtime, and has no code of its own. The board is the
MicroPython port: its script prepares the environment, may build a firmware
with the runtime frozen in, and writes it. `hio` does the rest, inside a
container started by the driver: it builds the runtime and the components with
the board's mpy-cross, so building never depends on what is installed on your
computer.

## Writing a board's firmware script

A board says how MicroPython gets onto it, in its `manifest.yaml`:

```yaml
firmware:
  micropython: 1.29.0                       # the version the runtime compiles for
  image: henglosio/workbench-espressif:1.0.0  # the Docker image it all runs in
  script: ./src/firmware.ts                 # in any folder of the package
  methods: [uf2, serial]                    # how it can be written, the preferred first (default: [serial])
```

The script is TypeScript, run by Node as it is:

```ts
import type { BoardFirmware } from "@henglosio/runner";

export default {
  async prepare(ctx) {
    const micropython = `${ctx.cache}/micropython/v${ctx.micropython}`;
    await ctx.run("git", ["clone", "--depth", "1", "--branch", `v${ctx.micropython}`, "https://github.com/micropython/micropython.git", micropython]);
    await ctx.run("make", ["-C", `${micropython}/mpy-cross`]);
    return { mpyCross: `${micropython}/mpy-cross/build/mpy-cross` };
  },
  async build(ctx) {
    await ctx.run("make", ["-C", "ports/rp2", `FROZEN_MANIFEST=${ctx.freezeManifest}`]);
    await ctx.run("cp", ["build/firmware.uf2", ctx.firmwareOutput]);
  },
  async flash(ctx) {
    await ctx.send("serial", {
      write: ({ url, baudrate }) => ctx.run("my-flasher", ["--port", url, "--baud", String(baudrate), ctx.firmware ?? "stock.bin"]),
    });
  },
} satisfies BoardFirmware;
```

- **`prepare`** sets up what build and flash need in `ctx.cache` (the container is thrown away, the cache is kept), and **must return `{ mpyCross }`**: the mpy-cross of the board's MicroPython, which the runtime and the components are compiled with — so a fork's bytecode always matches. It runs once, until it succeeds, for the script, `ctx.micropython`, the image and the `scope: prepare` options; `hio firmware prepare --force` runs it again.
- **`build`** (optional) leaves a firmware with `ctx.freezeManifest` (the port's frozen modules plus the runtime) frozen in at `ctx.firmwareOutput`; a port without `boards/manifest.py` includes `ctx.runtimeManifest` (the runtime alone) from its own. Without `build`, or if it leaves nothing, the runtime goes on the board's filesystem as `.mpy` files instead.
- **`flash`** writes `ctx.firmware`, or the board's stock firmware when there's none, by `ctx.method` — the one of `firmware.methods` picked in the studio — with `ctx.send`: `"serial"` gives `write` the port's URL, `"uf2"` has the driver copy the file (`ctx.send("uf2", { file })`) to the drive the studio named.
- **`ctx.run`** never uses a shell, so a value is never read as a command.
- **`ctx.options`** has the board's `options`, as text.

**The image** can be any image with Node 24+ and the tools the script uses (the driver copies its runner in, the image needs no `hio`); the official ones, `henglosio/workbench-*`, are recommended. It reaches the board only through `ctx.send`.

**The firmware** must keep MicroPython's REPL on the serial port and match `firmware.micropython`.

**The script's syntax** must be what Node runs without transforming it: use `import type`, and no `enum`.

Try it without the studio with `hio firmware prepare|build|flash`, and check it with `hio lint`.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
