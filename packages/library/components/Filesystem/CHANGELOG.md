# @henglosio/component-filesystem

## 1.1.2

### Patch Changes

- Works on platform 2.0.0 too (`^1.2.0 || ^2.0.0`) — the runtime it runs on is the same.

## 1.1.1

### Patch Changes

- Manifest written the n8n way: each property has a `name`, `default`, `number` / `boolean` with `typeOptions`, options as `{ name, value }`, `displayOptions` by name. Same configs as before — same wire ids, defaults, ranges and visibility; a hosting with @henglosio/workflow 2.3.0 or later reads it.

## 1.1.0

### Minor Changes

- The sdk is now imported as `henglosio.sdk` (the PyPI package stays `hio-sdk`). hio-system ships it as henglosio/sdk on the board and keeps `hio.sdk` as an alias, so components written for 1.1 still work. Components import `henglosio.sdk` and need platform ^1.2.0. CLI: the component template imports `henglosio.sdk`, and flashing clears a stale /henglosio from the board as well as /hio.
