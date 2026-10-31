<div align="center">

# Henglos IO

**Program microcontrollers as a flow.**

Wire sensors, actuators and logic on a visual canvas, run it on a real board through a driver on
your machine, and step through it action by action — with every value on screen.

MicroPython · many boards · triggers · self-hosted

</div>

---

> [!WARNING]
> Henglos IO is in **beta**. It runs from this repository for now — there are no packaged
> releases yet, and things still change between versions.

## What it is

You compose a **workflow** in the **studio**: actions are nodes, outputs are wires. A small
MicroPython runtime on the board runs it, and a **driver** on the computer the board is plugged
into links the two.

- **A visual studio** — branch with If and Switch, loop with Repeat, bind one action's output to
  another's settings, keep values in workflow variables.
- **Triggers** — Start at boot, a pin changing, a timer, a web request, an IR code, a leak… each
  trigger runs its own branch, side by side with the others.
- **A step-through debugger** — pause before every action, read what it published, edit values on
  the fly, or *Listen* on a trigger and step through its branch when it fires.
- **Packages from npm** — every board and component is an npm package described by a
  `manifest.yaml`. GPIO, PWM, Servo, DHT, Water Sensor, Display, WiFi, HTTP, IR and more ship with
  it; write your own in a few lines of MicroPython.
- **Many boards** — a board is a package too: its pins, its firmware, what it offers (Wi-Fi,
  Bluetooth). The ESP32 comes ready; a workflow can move to another board from its settings.
- **Self-hosted** — the whole platform runs on your own machine or server.

## How it works

```txt
Browser (studio)  ⇄  Hosting  ⇄  Driver (your computer)  ⇄  Board (USB)
```

| Piece | What it does |
| --- | --- |
| **Studio** | The web app: your workflows, the package library, the canvas, the debugger. |
| **Hosting** | The server behind it: accounts, workflows, packages, and the link to your drivers. |
| **Driver** | `hio driver`, a small daemon on the computer the board is plugged into. It builds what the board needs and talks to it over its USB serial. |
| **Board** | Runs the Henglos IO platform on MicroPython and executes the workflow's actions. |

## Getting started

### Requirements

- [Node.js](https://nodejs.org) (developed on 24) and [pnpm](https://pnpm.io) 11
- [Docker](https://www.docker.com) — for the local package registry
- [Caddy](https://caddyserver.com) — optional, to serve everything behind one address
- A board — an ESP32 to start with — and a USB cable

### Run it from source

```bash
pnpm install

# The hosting's settings: database, JWT secret, registry…
cp apps/hosting/example.env apps/hosting/.env

# The database (SQLite by default)
pnpm --filter hosting db:push

# The local package registry (Verdaccio, on :4873) — set HIO_REGISTRY_URL=http://localhost:4873 in .env
(cd apps/hosting && docker compose -f docker-compose.dev.yaml up -d)

# Every app in development mode
pnpm dev
```

| Service | Port | What it is |
| --- | --- | --- |
| Studio | `5173` | The web app |
| Hosting | `3333` | The API, under `/io` |
| Package registry | `4873` | Verdaccio, for your own packages |
| Site & docs | `3000` | The website and the documentation |

The `Caddyfile` at the root serves the studio and the hosting together at `https://hio.localhost`:

```bash
caddy run
```

Open the studio. On the first run it opens the **setup** page — the account you create there is the
instance's first user.

### Pair a driver

On the computer your board is plugged into, build the CLI and pair it with your account (the
studio's **Drivers** page gives you the token):

```bash
pnpm --filter @henglosio/cli build
# The driver installs packages from npmjs by default — here, from the local Verdaccio.
export HENGLOS_REGISTRY=http://localhost:4873
node apps/cli/dist/index.mjs driver configure https://hio.localhost
node apps/cli/dist/index.mjs driver login <pair-token> "My bench"
node apps/cli/dist/index.mjs driver start
```

Then create a workflow in the studio, pick the board and its port, and press **Run**.

## Repository

A [pnpm](https://pnpm.io) + [Turborepo](https://turbo.build) monorepo.

| Path | What it is |
| --- | --- |
| [`apps/hosting`](apps/hosting) | The hosting — NestJS API, accounts, workflows, packages, the drivers' link |
| [`apps/web/app`](apps/web/app) | The studio — Next.js |
| [`apps/web/site`](apps/web/site) | The website and the documentation — Next.js + Fumadocs |
| [`apps/cli`](apps/cli) | `hio`, the Henglos IO CLI — `build`, `flash`, `driver` |
| [`packages/workflow`](packages/workflow) | The workflow model: schemas, use cases, the board's command encoding |
| [`packages/workflow-ui`](packages/workflow-ui) | The workflow canvas as a React component — a read-only viewer and a debug simulation |
| [`packages/ui`](packages/ui) | The design system |
| [`packages/shared`](packages/shared) | Protocol contracts between the apps |
| [`packages/driver`](packages/driver) | The driver — bundled into the CLI as `hio driver` |
| [`packages/platform`](packages/platform) | The MicroPython runtime that runs on the board, and its SDK |
| [`packages/runner`](packages/runner) | Builds firmware and components inside a container |
| [`packages/rfc2217`](packages/rfc2217) | Serial over the network (RFC 2217) |
| [`packages/packages`](packages/packages) | The official boards and components |

Common commands, from the root:

```bash
pnpm build          # build everything (Turborepo)
pnpm dev            # every app in development mode
```

## Writing your own packages

A component is an npm package with a `manifest.yaml` and one MicroPython script per action or
trigger:

```yaml
kind: component
name: Water Sensor
schemaVersion: 1

dependences:
  platform: ^1.0.0

schema:
  displayName: Water Sensor
  actions:
    - displayName: Read
      icon: droplets
      script: src/read.py
      configurations:
        - displayName: Signal Pin
          type: pin
          from: board
          filterBy: [analog_in]
      outputSchema:
        - name: wet
          type: bool
```

```python
from machine import ADC, Pin
from hio.sdk import HIOAction, action, SUCCESS, FALLBACK


@action("water sensor/read")
class ReadAction(HIOAction):

    async def execute(self, context):
        pin = context.get("read/signal pin")
        if pin is None:
            return FALLBACK

        context.set("wet", ADC(Pin(pin)).read_u16() > 8000)
        return SUCCESS
```

Publish it with `npm publish` and install it from the studio's store by its name. The full guide —
the manifest, triggers, boards — is in the documentation (`pnpm --filter site dev`, then
[localhost:3000/docs](http://localhost:3000/docs)).

## Telemetry

The hosting sends **anonymous** usage statistics (which features and packages are used — never
your workflows, names or data) to help decide what to build next. Turn it off with
`HIO_TELEMETRY=false` or `DO_NOT_TRACK=1` in `apps/hosting/.env`.

## License

Henglos IO is **fair-code**, distributed under the [Sustainable Use License](LICENSE). You can use
and modify it for your own or your company's internal use, and share it free of charge for
non-commercial purposes. Selling it, or offering it to others as a paid product or service, needs a
commercial agreement with the licensor.

## Support

If Henglos IO is useful to you, you can support its development:

<a href="https://www.buymeacoffee.com/henryvilani"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=henryvilani&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="40"></a>
