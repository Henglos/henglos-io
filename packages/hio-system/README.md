# hio-system

`@henglosio/hio-system`

The Henglos IO runtime that runs on the board itself, on top of MicroPython.

## What it does

- Receives the workflow from the driver and runs it, action by action.
- Runs the triggers — a pin changing, a timer, a web request… — each on its own branch.
- Reports back every value, so the studio can show and debug it.

## The sdk

Components are written against [`hio-sdk`](../hio-sdk) (`from henglosio.sdk import ...`).
In the monorepo it lives in `packages/hio-sdk` and comes in through the uv
workspace (`uv sync` at the root). Each release ships the sdk inside it —
`npm pack` / `npm publish` copy it to `henglosio/sdk` (prepack) and remove it
after (postpack); the tarball's `package.json` records its version under
`hio.sdk`. The board gets both packages: the runtime (`hio`) and the sdk
(`henglosio`).

Components written before 1.2.0 import `hio.sdk`: `hio/sdk` forwards to
`henglosio.sdk`, so they keep working.

## Where it fits

It is what every board and component depends on: their manifests say which platform versions they work with.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
