# @henglosio/workflow

## 2.2.0

### Minor Changes

- Switch cases carry their own condition (n8n style): each case has a value, an operation ("<type>:<operation>" — string, number, boolean, array or object, e.g. "string:equals", "number:gt", "array:length_gte") and a compare-to, and the Switch goes out the first case whose condition holds, or Default. Cases can be added, removed and reordered (`move:switch-case`). The node's single Value / Match configs are gone, and the configs go on the wire under new ids ("switch/case N value", "switch/case N operation", "switch/case N compare to"): the studio and the board must be updated together — a board on platform < 1.5.0 always goes out Default. On the board, Start and the flow actions (If, Switch, Repeat) moved to `builtin/` (`builtin/Start.py`, `builtin/flow/`).

## 2.1.0

### Minor Changes

- Boards can set up their firmware environment in a `prepare` of their own: the platform runs it before build and flash, under the cache lock, once per firmware script, MicroPython version and `scope: prepare` options, and the studio shows it as its own phase. Board options declare a `scope` (prepare, build or runtime): runtime options go to the board with the session (`henglosio.sdk.board_option`), with no build. The ESP32 board fetches MicroPython and ESP-IDF in `prepare` and needs platform ^1.4.0.

## 2.0.0

### Major Changes

- workflow: one use case per operation (switch cases, variables, connection waypoints), board options (`SetBoardOption`, `BoardOptionSchema`) and the wire `DataType` module. Removed: `FindActionHandler` (now `FindActionInput` / `FindActionOutput`), `INT_RANGE`, `NumberInputSchema`, `ArrayInputSchema`, `isStrShape`, `migrateVariable`, `pythonKind`, `withPythonKinds`. workflow-ui: built against @henglosio/workflow 2.
