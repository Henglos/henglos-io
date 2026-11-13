# hio-system

`@henglosio/hio-system`

The Henglos IO runtime that runs on the board itself, on top of MicroPython.

## What it does

- Receives the workflow from the driver and runs it, action by action.
- Runs the triggers — a pin changing, a timer, a web request… — each on its own branch.
- Reports back every value, so the studio can show and debug it.

## The sdk

Components are written against [`hio-sdk`](../hio-sdk) (`from hio.sdk import ...`).
In the monorepo it lives in `packages/hio-sdk` and comes in through the uv
workspace (`uv sync` at the root): `hio` is a namespace joining `hio/sdk` and
this package's `hio/system`. Each release ships the sdk inside it — `npm pack` /
`npm publish` copy it to `hio/sdk` (prepack) and remove it after (postpack);
the tarball's `package.json` records its version under `hio.sdk`.

## Where it fits

It is what every board and component depends on: their manifests say which platform versions they work with.

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
