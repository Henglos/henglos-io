# @henglosio/hio-system

## 1.3.0

### Minor Changes

- Limits are no longer compiled in: the runtime reads the workflow's overrides from /hio_settings.json when it starts, and the driver writes that file before a session (reloading the runtime when it changes). Changing a limit needs no compile or flash, and one firmware serves every workflow of a board.

## 1.2.0

### Minor Changes

- The sdk is now imported as `henglosio.sdk` (the PyPI package stays `hio-sdk`). hio-system ships it as henglosio/sdk on the board and keeps `hio.sdk` as an alias, so components written for 1.1 still work. Components import `henglosio.sdk` and need platform ^1.2.0. CLI: the component template imports `henglosio.sdk`, and flashing clears a stale /henglosio from the board as well as /hio.
