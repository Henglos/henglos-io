# @henglosio/workflow

## 2.6.0

### Minor Changes

- 62fd885: A board's schema carries how its firmware can be written (`flashMethods`: serial, uf2).

## 2.5.0

### Minor Changes

- No two nodes share a name: adding or renaming one to a name already taken numbers it ("If" → "If 2"). New `uniqueActionAlias` helper.

## 2.4.0

### Minor Changes

- `GenerateExecuteCommand.execute` takes `{ freshVariables }`: the Start carries `start/fresh` (`START_FRESH_CONFIG_ID`) so the board restarts its variables.

## 2.3.0

### Minor Changes

- If and Switch are described with manifest properties like any component: If's Conditions are a `filter`, Switch's Routing Rules a `fixedCollection` of filters — out the first rule that holds, or Default. An action can declare `dynamicOutputs`: an output per row of a fixedCollection (Switch's case_N), kept in step with the rows and their wires. On the board, If and Switch evaluate their filters with henglosio.sdk's `matches`, an output or a variable dropped on a value read by its name. If / Switch nodes of an older shape are migrated when the workflow opens; the studio and the board must be updated together — a board on platform < 1.6.0 doesn't read today's If / Switch.
- Manifest properties can be written the n8n way: `name`, `default`, `hint`, `typeOptions` (`password`, `rows`, `editor`, `minValue` / `maxValue` / `numberPrecision`, `multipleValues`), options as `{ name, value }`, and `displayOptions` keyed by a sibling's `name`. `boolean` and `number` are read as `toggle` and `integer` / `float`; the old types keep working. New types: `dateTime`, `multiOptions`, `json`, `notice`, `collection`, `fixedCollection`, `filter` and `assignmentCollection` — each sent to the board as the action reads it (a filter without the studio's ids, pairs as an object, JSON parsed). A property can declare a `category`, the section the studio shows it in. Values of Variables' Set / Append / Set Field can be typed in as any value type (string, list, object too).
- Nodes can be renamed (`update:action-alias`) — only the name shown: the wire ids stay.

## 2.2.0

### Minor Changes

- Switch cases carry their own condition (n8n style): each case has a value, an operation ("<type>:<operation>" — string, number, boolean, array or object, e.g. "string:equals", "number:gt", "array:length_gte") and a compare-to, and the Switch goes out the first case whose condition holds, or Default. Cases can be added, removed and reordered (`move:switch-case`). The node's single Value / Match configs are gone, and the configs go on the wire under new ids ("switch/case N value", "switch/case N operation", "switch/case N compare to"): the studio and the board must be updated together — a board on platform < 1.5.0 always goes out Default. On the board, Start and the flow actions (If, Switch, Repeat) moved to `builtin/` (`builtin/Start.py`, `builtin/flow/`).

## 2.1.0

### Minor Changes

- Boards can set up their firmware environment in a `prepare` of their own: the platform runs it before build and flash, under the cache lock, once per firmware script, MicroPython version and `scope: prepare` options, and the studio shows it as its own phase. Board options declare a `scope` (prepare, build or runtime): runtime options go to the board with the session (`henglosio.sdk.board_option`), with no build. The ESP32 board fetches MicroPython and ESP-IDF in `prepare` and needs platform ^1.4.0.

## 2.0.0

### Major Changes

- workflow: one use case per operation (switch cases, variables, connection waypoints), board options (`SetBoardOption`, `BoardOptionSchema`) and the wire `DataType` module. Removed: `FindActionHandler` (now `FindActionInput` / `FindActionOutput`), `INT_RANGE`, `NumberInputSchema`, `ArrayInputSchema`, `isStrShape`, `migrateVariable`, `pythonKind`, `withPythonKinds`. workflow-ui: built against @henglosio/workflow 2.
