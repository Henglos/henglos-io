# @henglosio/workflow-ui

## 3.0.0

### Major Changes

- Every HenglosIO package now shares its major: compatible means the same major. Boards and components depend on platform ^3.0.0.

## 1.0.4

### Patch Changes

- Manifest properties can be written the n8n way: `name`, `default`, `hint`, `typeOptions` (`password`, `rows`, `editor`, `minValue` / `maxValue` / `numberPrecision`, `multipleValues`), options as `{ name, value }`, and `displayOptions` keyed by a sibling's `name`. `boolean` and `number` are read as `toggle` and `integer` / `float`; the old types keep working. New types: `dateTime`, `multiOptions`, `json`, `notice`, `collection`, `fixedCollection`, `filter` and `assignmentCollection` — each sent to the board as the action reads it (a filter without the studio's ids, pairs as an object, JSON parsed). A property can declare a `category`, the section the studio shows it in. Values of Variables' Set / Append / Set Field can be typed in as any value type (string, list, object too).
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @henglosio/workflow@2.3.0
  - @henglosio/ui@1.2.0

## 1.0.3

### Patch Changes

- workflow: one use case per operation (switch cases, variables, connection waypoints), board options (`SetBoardOption`, `BoardOptionSchema`) and the wire `DataType` module. Removed: `FindActionHandler` (now `FindActionInput` / `FindActionOutput`), `INT_RANGE`, `NumberInputSchema`, `ArrayInputSchema`, `isStrShape`, `migrateVariable`, `pythonKind`, `withPythonKinds`. workflow-ui: built against @henglosio/workflow 2.
- Updated dependencies
  - @henglosio/workflow@2.0.0
