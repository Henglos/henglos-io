# hio — the command line

`@henglosio/cli`

`hio`, the Henglos IO command-line tool.

## What it does

- `hio driver` — turns your computer into a driver: it links the boards plugged into it to the hosting.
- `hio create` — starts a new board or component from a template, ready to edit and publish.
- `hio lint` — checks a package before you publish it.
- `hio build` and `hio flash` — build a workflow for a board and write it to the board. These are
  mostly run for you, behind the scenes, while the driver works.

## Making your own packages

```bash
hio create component "Water Sensor"   # → ./component-water-sensor
hio create board "My Board"           # → ./board-my-board
hio lint                              # check the package in this folder
```

A component comes with one action and one trigger, already working; a board comes set up for an
ESP32. `--dir` picks the folder, `--package-name` the npm name (e.g. `@you/component-water-sensor`).

`hio lint` checks what the studio checks when it installs a package — and what would only break on
the board, like a script registering a different name than the manifest's. It points every problem
at its file and line, and fails (exit code 1) on any error.

## Where it fits

```txt
Studio (browser)  ⇄  Hosting  ⇄  Driver (your computer)  ⇄  Board (USB)
```

The CLI is how the driver gets onto your computer.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
