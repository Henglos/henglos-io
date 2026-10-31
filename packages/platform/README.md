# Platform

`@henglosio/platform`

The Henglos IO runtime that runs on the board itself, on top of MicroPython.

## What it does

- Receives the workflow from the driver and runs it, action by action.
- Runs the triggers — a pin changing, a timer, a web request… — each on its own branch.
- Reports back every value, so the studio can show and debug it.
- Gives components a small SDK to write their actions in MicroPython.

## Where it fits

It is what every board and component depends on: their manifests say which platform versions they work with.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
