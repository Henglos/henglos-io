# @henglosio/workflow

## 2.0.0

### Major Changes

- workflow: one use case per operation (switch cases, variables, connection waypoints), board options (`SetBoardOption`, `BoardOptionSchema`) and the wire `DataType` module. Removed: `FindActionHandler` (now `FindActionInput` / `FindActionOutput`), `INT_RANGE`, `NumberInputSchema`, `ArrayInputSchema`, `isStrShape`, `migrateVariable`, `pythonKind`, `withPythonKinds`. workflow-ui: built against @henglosio/workflow 2.
