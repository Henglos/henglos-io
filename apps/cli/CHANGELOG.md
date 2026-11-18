# @henglosio/cli

## 1.6.0

### Minor Changes

- 3babe84: Driver: pairing no longer reads the machine's hardware id — it was sent to the hosting and never checked — and the native `native-machine-id` dependency is gone (no more "Try run as admin" on `hio driver login`). Pairing needs a hosting that doesn't ask for it (this release on); one already paired keeps working with any.

### Patch Changes

- fdaaacc: Driver: the build containers' tunnels listen only where containers reach the host (the loopback on Docker Desktop, the Docker bridge's gateway on a native Linux engine; HIO_TUNNEL_HOST overrides it), not on every interface; a container's messages count only with its session's token (HIO_CALLBACK_TOKEN); the unused /serial-control endpoint is gone.
- 0d05585: Driver: a workflow new to the driver synced with no packages (its folder was created without waiting), so compiling it said its board package wasn't installed; and one workflow failing to sync no longer stops the others. The driver answers a workflow sync once — its error, or whether every workflow synced — so the studio can show it.

## 1.5.0

### Minor Changes

- The driver injects its own runner host (dist/runner-host.mjs, one self-contained file) into the build container and runs it with the image's Node — an image needs Node, Python and its board's tools, not `hio`, and the runner always matches the driver. Images without it fall back to their `hio`. `hio firmware` fetches the platform on the host and runs the same runner host, and takes `--baudrate`. Flashing passes its arguments without a shell.

## 1.4.0

### Minor Changes

- Boards can set up their firmware environment in a `prepare` of their own: the platform runs it before build and flash, under the cache lock, once per firmware script, MicroPython version and `scope: prepare` options, and the studio shows it as its own phase. Board options declare a `scope` (prepare, build or runtime): runtime options go to the board with the session (`henglosio.sdk.board_option`), with no build. The ESP32 board fetches MicroPython and ESP-IDF in `prepare` and needs platform ^1.4.0.

## 1.3.0

### Minor Changes

- Limits are no longer compiled in: the runtime reads the workflow's overrides from /hio_settings.json when it starts, and the driver writes that file before a session (reloading the runtime when it changes). Changing a limit needs no compile or flash, and one firmware serves every workflow of a board.

## 1.2.0

### Minor Changes

- `hio create board` writes a minimal, typed board for any MicroPython board: build and flash are empty stubs taking FirmwareBuildContext / FirmwareFlashContext — no ESP32 recipe, image, pins or capabilities. New components and boards require platform ^1.2.0 (henglosio.sdk).

## 1.1.2

### Patch Changes

- Flashing a frozen runtime creates the folders it writes into first: on a freshly erased board, writing components/__init__.py failed with OSError ENOENT.

## 1.1.1

### Patch Changes

- The sdk is now imported as `henglosio.sdk` (the PyPI package stays `hio-sdk`). hio-system ships it as henglosio/sdk on the board and keeps `hio.sdk` as an alias, so components written for 1.1 still work. Components import `henglosio.sdk` and need platform ^1.2.0. CLI: the component template imports `henglosio.sdk`, and flashing clears a stale /henglosio from the board as well as /hio.
