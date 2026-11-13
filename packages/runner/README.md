# Runner

`@henglosio/runner`

The builder that turns a workflow into something a board can run.

## What it does

- Gathers the workflow, its board and its components.
- Checks that everything fits together.
- Builds the result and hands it to the driver to write to the board.

## Where it fits

It runs inside a container started by the driver, so building never depends on what is installed on your computer.

## Writing a board's firmware script

A board says how MicroPython gets onto it, in its `manifest.yaml`:

```yaml
firmware:
  micropython: 1.29.0                       # the version the runtime compiles for
  image: henglosio/workbench-esp32:1.0.0    # the Docker image it all runs in
  script: ./src/firmware.ts                 # in any folder of the package
```

The script is TypeScript, run by Node as it is:

```ts
import type { BoardFirmware } from "@henglosio/runner";

export default {
  async build(ctx) {
    await ctx.run("make", ["-C", "ports/rp2", `FROZEN_MANIFEST=${ctx.freezeManifest}`]);
    await ctx.run("cp", ["build/firmware.uf2", ctx.firmwareOutput]);
  },
  async flash(ctx) {
    await ctx.run("my-flasher", ["--port", ctx.serialUrl, ctx.firmware ?? "stock.bin"]);
  },
} satisfies BoardFirmware;
```

- **`build`** leaves a firmware with `ctx.freezeManifest` frozen in at `ctx.firmwareOutput`. If it leaves nothing, the runtime goes on the board's filesystem as `.mpy` files instead.
- **`flash`** writes `ctx.firmware`, or the board's stock firmware when there's none.
- **`ctx.run`** never uses a shell, so a value is never read as a command.
- **`ctx.options`** has the board's `options`, as text.

**The image** can be any image with Node 24+, `hio` and Python 3 with pip; the official ones, `henglosio/workbench-*`, are recommended. It only reaches the board through the serial port, at `ctx.serialUrl`.

**The firmware** must keep MicroPython's REPL on the serial port and match `firmware.micropython`.

**The script's syntax** must be what Node runs without transforming it: use `import type`, and no `enum`.

Try it without the studio with `hio firmware build`, and check it with `hio lint`.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
