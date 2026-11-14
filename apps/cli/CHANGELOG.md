# @henglosio/cli

## 1.1.2

### Patch Changes

- Flashing a frozen runtime creates the folders it writes into first: on a freshly erased board, writing components/__init__.py failed with OSError ENOENT.

## 1.1.1

### Patch Changes

- The sdk is now imported as `henglosio.sdk` (the PyPI package stays `hio-sdk`). hio-system ships it as henglosio/sdk on the board and keeps `hio.sdk` as an alias, so components written for 1.1 still work. Components import `henglosio.sdk` and need platform ^1.2.0. CLI: the component template imports `henglosio.sdk`, and flashing clears a stale /henglosio from the board as well as /hio.
