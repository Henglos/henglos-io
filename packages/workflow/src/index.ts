// Domain schemas (Zod validators) — use as BoardSchema.safeParse(…)
export * from "./domain/entities/IBoard.schema.js";
export * from "./domain/entities/IComponent.schema.js";
export * from "./domain/entities/IConfiguration.schema.js";
export * from "./domain/entities/ICredentialType.schema.js";
export * from "./domain/entities/IAction.schema.js";
export * from "./domain/entities/IHandler.schema.js";
export * from "./domain/entities/ICoreComponent.schema.js";
export * from "./domain/schemas/ISchema.schema.js";
export * from "./domain/entities/IPin.schema.js";

// Domain types (inferred from schemas)
export * from "./domain/entities/IBoard.schema.js";
export * from "./domain/entities/IComponent.schema.js";
export * from "./domain/entities/IConfiguration.schema.js";
export * from "./domain/entities/IAction.schema.js";
export * from "./domain/entities/IHandler.schema.js";
export * from "./domain/entities/ICoreComponent.schema.js";
export * from "./domain/schemas/ISchema.schema.js";
export * from "./domain/entities/IPin.schema.js";

// The wire's value types (PacketCodec.py's DataType) and their encoding
export * from "./domain/wire/DataType.js";

// Runtime types
export * from "./domain/entities/IWorkflow.runtime.js";
export * from "./domain/entities/IBoard.runtime.js";
export * from "./domain/entities/IComponent.runtime.js";
export * from "./domain/entities/IAction.runtime.js";
export * from "./domain/entities/IConfiguration.runtime.js";
export * from "./domain/entities/IHandler.runtime.js";
export * from "./domain/entities/IConnection.runtime.js";
export * from "./domain/entities/IVariable.runtime.js";

// Use-cases — configurations
export * from "./application/use-cases/configurations/CreateConfiguration.js";
export * from "./application/use-cases/configurations/UpdateConfigurationValue.js";
export * from "./application/use-cases/configurations/SetConfigurationBinding.js";
export * from "./application/use-cases/configurations/SetConfigurationOutputBinding.js";
export * from "./application/use-cases/configurations/SetConfigurationCode.js";
export * from "./application/use-cases/configurations/ClearConfigurationBinding.js";

// Use-cases — actions
export * from "./application/use-cases/actions/CreateAction.use-case.js";
export * from "./application/use-cases/actions/UpdateActionConfiguration.js";
export * from "./application/use-cases/actions/BindActionConfigurationOutput.js";
export * from "./application/use-cases/actions/SetActionConfigurationCode.js";
export * from "./application/use-cases/actions/FindActionInput.js";
export * from "./application/use-cases/actions/FindActionOutput.js";

// Use-cases — board
export * from "./application/use-cases/board/CreateBoard.use-case.js";
export * from "./application/use-cases/board/UpdateBoardConfiguration.use-case.js";
export * from "./application/use-cases/board/SetBoardConnection.use-case.js";
export * from "./application/use-cases/board/AddActionToBoard.use-case.js";
export * from "./application/use-cases/board/RemoveActionFromBoard.use-case.js";
export * from "./application/use-cases/board/UpdateBoardActionConfiguration.use-case.js";
export * from "./application/use-cases/board/BindBoardActionConfiguration.use-case.js";
export * from "./application/use-cases/board/ClearBoardActionConfigurationBinding.use-case.js";

// Use-cases — component
export * from "./application/use-cases/component/CreateComponent.use-case.js";
export * from "./application/use-cases/component/AddAction.use-case.js";
export * from "./application/use-cases/component/RemoveAction.use-case.js";
export * from "./application/use-cases/component/UpdateActionConfiguration.use-case.js";
export * from "./application/use-cases/component/BindActionConfiguration.use-case.js";
export * from "./application/use-cases/component/BindActionConfigurationOutput.use-case.js";
export * from "./application/use-cases/component/SetActionConfigurationCode.use-case.js";
export * from "./application/use-cases/component/ClearActionConfigurationBinding.use-case.js";

// Use-cases — connection
export * from "./application/use-cases/connection/CreateConnection.use-case.js";

// Use-cases — workflow
export * from "./application/use-cases/workflow/CreateWorkflow.use-case.js";
export * from "./application/use-cases/workflow/AddComponent.use-case.js";
export * from "./application/use-cases/workflow/RemoveComponent.use-case.js";
export * from "./application/use-cases/workflow/AddActionToComponent.use-case.js";
export * from "./application/use-cases/workflow/RemoveActionFromComponent.use-case.js";
export * from "./application/use-cases/workflow/AddConnection.use-case.js";
export * from "./application/use-cases/workflow/RemoveConnection.use-case.js";
export * from "./application/use-cases/workflow/AddConnectionWaypoint.use-case.js";
export * from "./application/use-cases/workflow/MoveConnectionWaypoint.use-case.js";
export * from "./application/use-cases/workflow/SetConnectionWaypointHandle.use-case.js";
export * from "./application/use-cases/workflow/SetConnectionWaypoints.use-case.js";
export * from "./application/use-cases/workflow/ShiftConnectionWaypoints.use-case.js";
export * from "./application/use-cases/workflow/RemoveConnectionWaypoint.use-case.js";
export * from "./application/use-cases/workflow/BindActionConfigurationOutput.use-case.js";
export * from "./application/use-cases/workflow/SetActionConfigurationCode.use-case.js";
export * from "./application/use-cases/workflow/SetActionNotes.use-case.js";
export * from "./application/use-cases/workflow/SetActionDisabled.use-case.js";
export * from "./application/use-cases/workflow/PassContext.use-case.js";
export { MAX_SWITCH_CASES, CONFIGS_PER_SWITCH_CASE, switchCaseCount, isSwitchAction, caseNumber } from "./application/use-cases/workflow/SwitchCases.js";
export * from "./application/use-cases/workflow/AddSwitchCase.use-case.js";
export * from "./application/use-cases/workflow/RemoveSwitchCase.use-case.js";
export * from "./application/use-cases/workflow/MoveSwitchCase.use-case.js";
export * from "./application/use-cases/workflow/Capabilities.use-case.js";
export * from "./domain/value-objects/Capabilities.js";
export * from "./application/use-cases/workflow/WithoutDisabledActions.js";
export * from "./application/use-cases/workflow/ResolveBoardInstall.use-case.js";
export * from "./application/use-cases/workflow/WorkflowFileValues.js";
export * from "./application/use-cases/workflow/WorkflowCredentialValues.js";
export * from "./domain/value-objects/ShapeValue.js";
export * from "./domain/value-objects/WirePath.js";
export { computeWireVariableId, validateVariableName, workflowVariableInitialError } from "./application/use-cases/workflow/WorkflowVariables.js";
export * from "./application/use-cases/workflow/AddWorkflowVariable.use-case.js";
export * from "./application/use-cases/workflow/UpdateWorkflowVariable.use-case.js";
export * from "./application/use-cases/workflow/RemoveWorkflowVariable.use-case.js";
export * from "./application/use-cases/workflow/BindWorkflowActionConfigurationVariable.use-case.js";
export * from "./application/use-cases/workflow/SetPlatformSetting.use-case.js";
export * from "./application/use-cases/workflow/SetBoardOption.use-case.js";
export * from "./application/use-cases/workflow/UpdateActionConfiguration.use-case.js";
export * from "./application/use-cases/workflow/GenerateExecuteCommand.use-case.js";
export * from "./application/use-cases/workflow/ResolveWorkflowAction.js";
export * from "./application/use-cases/workflow/ResolveNextAction.use-case.js";
export * from "./application/use-cases/workflow/ResolveRecordSequence.use-case.js";
export * from "./application/use-cases/workflow/WorkflowEntries.js";

// Services
export * from "./application/services/ConfigurationParser.service.js";

// Value objects & utils
export * from "./domain/value-objects/Color.js";
export * from "./domain/value-objects/StartAction.js";
export * from "./domain/value-objects/VariablesComponent.js";
export * from "./domain/value-objects/LogicComponent.js";
export * from "./domain/value-objects/TriggerNodes.js";
export * from "./application/services/ConfigurationVisibility.js";
export * from "./domain/value-objects/ProtocolLimits.js";
export * from "./utils/identifier.js";
export * from "./patterns/common.js";
export * from "./patterns/registry.js";

// Collaboration — IWorkflowRuntime <-> Y.Doc (Hocuspocus on the hosting, provider in the studio)
export * from "./collab/WorkflowDoc.js";
