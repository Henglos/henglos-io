import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import type { IBindingSchema, IOutputBindingSchema, IAnyValueSchema, IFileValueSchema, ICredentialValueSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { credentialBoardPath, fileBoardPath } from "./ResolveBoardInstall.use-case.js";
import type { IPinSchema } from "../../../domain/entities/IPin.schema.js";
import { Color } from "../../../domain/value-objects/Color.js";
import { ConfigurationParser } from "../../services/ConfigurationParser.service.js";
import { resolveWorkflowAction, computeWireActionId, computeWireInstanceId } from "./ResolveWorkflowAction.js";
import { computeWireOutputId, getActionOutputs } from "./ResolveNextAction.use-case.js";
import { generateId } from "../../../utils/identifier.js";
import { computeWireVariableId } from "./WorkflowVariables.js";
import { protocolLimits } from "../../../domain/value-objects/ProtocolLimits.js";
import { isConfigurationVisible } from "../../services/ConfigurationVisibility.js";
import type { IShape } from "../../../domain/schemas/ISchema.schema.js";
import { validateShape } from "../../../domain/value-objects/ShapeValue.js";
import { actionPassesContext, PASS_CONTEXT_CONFIG_ID } from "./PassContext.use-case.js";
import { LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";
import {
	DataType, INTEGER_RANGE, buildValueEntry, encodeBool, encodeBytes, encodeFloat, encodeInteger, encodeJson, encodeString, encodeValue,
	type EncodedValue,
} from "../../../domain/wire/DataType.js";

// A real runtime global in both the browser and Node — just missing from this
// package's tsconfig "lib" (ESNext only, no DOM), so it's declared narrowly
// here instead of pulling in the whole DOM lib (which apps/web also bundles
// this package into, alongside Node-only consumers like apps/hosting).
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

// REQUEST command ids understood by the firmware (see packages/hio-system's
// PacketCodec.py). Execute and Record share this exact body shape (ACTION_ID +
// OUTPUTS + CONFIGS, decoded by ActionBody.py) — only the COMMAND_ID byte
// differs, so both go through the same builder below.
export const EXECUTE_COMMAND_ID = 0x01;
/** COMMAND_ID of a RECORD frame: same body as an EXECUTE, stored on the board instead of run. */
export const RECORD_COMMAND_ID = 0x04;
// One action on its own, outside the flow — same body again (RunPacket.py).
export const RUN_COMMAND_ID = 0x0C;

// CONFIG entry VALUE TYPE (see PacketCodec.py's ConfigValueType).
const VALUE_TYPE_LITERAL = 0x00;
const VALUE_TYPE_BIND = 0x01;
const VALUE_TYPE_CODE = 0x02;
const VALUE_TYPE_VARIABLE = 0x04;

// Firmware ceilings — per workflow, see ProtocolLimits.ts. Re-exported here
// for the callers that always imported them from this module.
export { MAX_CODE_BUFFER, MAX_DATA_BUFFER, PROTOCOL_LIMIT_DEFAULTS, protocolLimits, type ProtocolLimits } from "../../../domain/value-objects/ProtocolLimits.js";

// A number config's typed-in value (a math expression is fine) as its number.
function evaluateNumber(config: IConfigurationRuntime): number {
	const [, result, matched] = ConfigurationParser.parse(String(config.value), ConfigurationParser.pipesFor(config.base));
	if (!matched) throw new Error(`Não foi possível calcular a expressão da configuração "${config.base.displayName}": ${config.value}`);
	return result as number;
}

function encodeConfigurationValue(config: IConfigurationRuntime): EncodedValue {
	switch (config.base.type) {

		case "toggle":
			return encodeBool(!!config.value);

		case "integer": {
			const value = evaluateNumber(config);
			if (!Number.isInteger(value) || value < INTEGER_RANGE[0] || value > INTEGER_RANGE[1]) {
				throw new Error(`A configuração "${config.base.displayName}" espera um inteiro, não ${value}`);
			}
			return encodeInteger(value);
		}

		case "float":
			return encodeFloat(evaluateNumber(config));

		case "color": {
			// RGBA — its 4 channel bytes.
			const color = Color.fromHex(config.value as string);
			return encodeBytes([color.R, color.G, color.B, color.A]);
		}

		case "pin":
			return encodeInteger((config.value as IPinSchema).gpio);

		case "any": {
			// An integer, a float or a bool typed in — see AnyValueSchema.
			const anyValue = config.value as IAnyValueSchema;
			return encodeValue(anyValue.kind, anyValue.value);
		}

		case "bytes":
			// Raw bytes (0-255 each) — not UTF-8 text.
			return encodeBytes(config.value as number[]);

		case "file":
			// The file itself reaches the board with the components (see
			// ResolveBoardInstall): the config carries where — its path.
			return encodeString(fileBoardPath(config.value as IFileValueSchema));

		case "credential":
			// Same for a credential: its values are put on the board by the
			// hosting — the config carries their file's path, never the values.
			return encodeString(credentialBoardPath((config.value as ICredentialValueSchema).credentialId));

		case "list":
		case "object":
			return encodeJson(config.value);

		case "string":
		case "password":
		case "options":
		case "code":
		default:
			return encodeString(config.value as string);
	}
}

// CONFIG_ID: config.base.id when the schema sets one explicitly (an escape
// hatch for a config the firmware needs to match by a raw literal id instead
// of the hashed name — unused today, see IConfigurationSchema.id), otherwise
// generateId(`${actionName}/${displayName}` lowercased) — what the action's
// context.get("<action>/<config>") hashes too.
function computeWireConfigId(actionName: string, config: IConfigurationRuntime): number {
	if (config.base.id !== undefined) return config.base.id;
	return generateId(`${actionName}/${config.base.displayName}`.toLowerCase());
}

// A BIND's source isn't a config — it's a named entry in the source action's
// outputSchema (the values an action actually produces at runtime, e.g. GPIO
// Read's "value"), which has no per-action prefix on the wire: an action
// publishes it with context.set("value"), i.e. under generateId("value").
function computeWireOutputSchemaId(outputName: string): number {
	return generateId(outputName.toLowerCase());
}

// Resolves binding.outputName to its SOURCE ID — by the output's name, which
// is all the board goes by (not its configurations — a bind reads another
// action's runtime result, not another config's static value). Returns
// undefined when no action declares that output at all, so the caller can drop
// the entry instead of emitting a SOURCE ID nothing will ever publish.
//
// A binding can also be the OTHER shape — IBindingSchema's {actionId,
// configurationName} (see SetConfigurationBinding), which points at another
// action's CONFIG rather than its published output. That has no wire
// representation: the board's pipeline only holds what actions published, so
// there's nothing a SOURCE_ID could point at — dropped like a dangling bind.
function resolveBindSourceId(workflow: IWorkflowRuntime, binding: IBindingSchema | IOutputBindingSchema): number | undefined {
	if (!("outputName" in binding)) {
		return undefined;
	}

	// By name: the board looks the value up by its name (whatever action
	// published it), so the action it was dragged from may be gone — removed
	// and added again — as long as one publishes that name. Only a name no
	// action declares at all is dropped.
	const name = binding.outputName.toLowerCase();
	const declared = [workflow.start, ...workflow.board.actions, ...workflow.components.flatMap(component => component.actions)]
		.some(action => (action.base.outputSchema ?? []).some(output => output.name.toLowerCase() === name));
	if (!declared) {
		return undefined;
	}

	return computeWireOutputSchemaId(binding.outputName);
}

// The DataType a config's value must arrive as — a BIND's / VARIABLE's
// EXPECTED_TYPE and a CODE's RESULT_TYPE: the board converts what reaches it
// to this when that loses nothing (Context.convert), or the action goes out
// Fallback. AUTO ("any"): as it arrives — a literal's kind says nothing about
// a bind or a script (Variables' Set with `return True` is a bool, fine).
// "code" (the Monaco script field itself) has none on purpose — a script
// computing the script to run doesn't mean anything.
function resolveExpectedType(config: IConfigurationRuntime): number | undefined {
	switch (config.base.type) {
		case "toggle": return DataType.BOOL;
		case "integer": return DataType.INTEGER;
		case "float": return DataType.FLOAT;
		case "pin": return DataType.INTEGER;
		case "string":
		case "password":
		case "options":
			return DataType.STRING;
		case "bytes":
		case "color":
			return DataType.BYTES;
		case "list": return DataType.LIST;
		case "object": return DataType.OBJECT;
		case "any": return DataType.AUTO;
		default: return undefined;
	}
}

// A workflow variable by its id, or undefined when it's gone — the binding /
// Variables action that pointed at it is then dropped, like a dangling bind.
function resolveVariable(workflow: IWorkflowRuntime, variableId: string) {
	return (workflow.variables ?? []).find(v => v.id === variableId);
}

// LITERAL entry bytes: CONFIG_ID(16) + 0x00 + DATA_TYPE(8) + [DATA_SIZE(16) if sized] + DATA
function buildLiteralEntry(configId: number, encoded: EncodedValue): Uint8Array {
	return buildValueEntry(configId, encoded, VALUE_TYPE_LITERAL);
}

// "core/start" also seeds the workflow variables: one LITERAL per variable
// with an initial value, CONFIG_ID = its VARIABLE_ID. The platform's _start
// stores them in GlobalVariables — only when a variable has no value yet, so
// looping back to Start keeps what the program wrote.
function buildVariableInitialEntries(workflow: IWorkflowRuntime): Uint8Array[] {
	const { maxData } = protocolLimits(workflow);
	return (workflow.variables ?? [])
		.filter(variable => variable.initial !== null)
		.map(variable => {
			const encoded = encodeValue(variable.type, variable.initial);
			// A string initial value set under a bigger MAX_DATA_BUFFER than the workflow has now.
			if (encoded.data.length > maxData) {
				throw new Error(`O valor inicial da variável "${variable.name}" tem ${encoded.data.length} bytes — o máximo que a placa aceita é ${maxData}`);
			}
			return buildLiteralEntry(computeWireVariableId(variable.name), encoded);
		});
}

// LITERAL:  CONFIG_ID(16) + VALUE_TYPE(8)=0x00 + DATA_TYPE(8) + [DATA_SIZE(16) if sized] + DATA
// BIND:     CONFIG_ID(16) + VALUE_TYPE(8)=0x01 + SOURCE_ID(16) + EXPECTED_TYPE(8)
// CODE:     CONFIG_ID(16) + VALUE_TYPE(8)=0x02 + RESULT_TYPE(8) + CODE_SIZE(16) + CODE
// VARIABLE: CONFIG_ID(16) + VALUE_TYPE(8)=0x04 + VARIABLE_ID(16) + EXPECTED_TYPE(8)
//
// EXPECTED_TYPE: see resolveExpectedType. AUTO for Logic (it compares values
// as they are).
function buildConfigEntry(workflow: IWorkflowRuntime, actionName: string, config: IConfigurationRuntime, logic = false): Uint8Array | undefined {

	const configId = computeWireConfigId(actionName, config);
	const expectedType = logic ? DataType.AUTO : resolveExpectedType(config) ?? DataType.AUTO;

	if (config.binding && "variableId" in config.binding) {

		const variable = resolveVariable(workflow, config.binding.variableId);
		if (!variable) return undefined;

		const entry = new Uint8Array(6);
		const view = new DataView(entry.buffer);
		view.setUint16(0, configId, true);
		entry[2] = VALUE_TYPE_VARIABLE;
		view.setUint16(3, computeWireVariableId(variable.name), true);
		entry[5] = expectedType;
		return entry;

	}

	// A "variable" config (the Variables actions' target) carries which
	// variable as its VARIABLE_ID — a LITERAL INTEGER.
	if (!config.binding && config.base.type === "variable") {

		const variable = resolveVariable(workflow, config.value as string);
		if (!variable) return undefined;

		return buildLiteralEntry(configId, encodeInteger(computeWireVariableId(variable.name)));

	}

	if (config.binding && "code" in config.binding) {

		const resultType = logic && config.base.type === "string" ? DataType.AUTO : resolveExpectedType(config);
		if (resultType === undefined) {
			return undefined;
		}

		const code = new TextEncoder().encode(config.binding.code);
		const { maxCode } = protocolLimits(workflow);
		if (code.length > maxCode) {
			throw new Error(`O código da configuração "${config.base.displayName}" tem ${code.length} bytes — o máximo que a placa aceita é ${maxCode}`);
		}

		const entry = new Uint8Array(6 + code.length);
		const view = new DataView(entry.buffer);
		view.setUint16(0, configId, true);
		entry[2] = VALUE_TYPE_CODE;
		entry[3] = resultType;
		view.setUint16(4, code.length, true);
		entry.set(code, 6);
		return entry;

	}

	if (config.binding) {

		const sourceId = resolveBindSourceId(workflow, config.binding);
		if (sourceId === undefined) return undefined;

		const entry = new Uint8Array(6);
		const view = new DataView(entry.buffer);
		view.setUint16(0, configId, true);
		entry[2] = VALUE_TYPE_BIND;
		view.setUint16(3, sourceId, true);
		entry[5] = expectedType;
		return entry;

	}

	// The manifest's `patterns` filters — the studio checks them as the user
	// types, but a value set some other way (an older workflow, a pasted
	// action, a filter added in a newer package version) is only caught here.
	if (typeof config.value === "string") {
		const problem = ConfigurationParser.validate(config.base, config.value);
		if (problem) throw new Error(`A configuração "${config.base.displayName}" tem um valor inválido ("${config.value}"): ${problem}`);
	}

	// A list / an object typed in the studio — checked against its shape too.
	if (config.base.type === "list" || config.base.type === "object") {
		const shape: IShape = config.base.type === "list"
			? { list: config.base.items }
			: { object: Object.fromEntries(config.base.fields.map(field => [field.name, field.type])) };
		const problem = validateShape(shape, config.value);
		if (problem) throw new Error(`A configuração "${config.base.displayName}" tem um valor inválido — ${problem}`);
		if (config.base.type === "list" && config.base.maxItems !== undefined && (config.value as unknown[]).length > config.base.maxItems) {
			throw new Error(`A configuração "${config.base.displayName}" tem ${(config.value as unknown[]).length} itens — o máximo é ${config.base.maxItems}`);
		}
	}

	const encoded = encodeConfigurationValue(config);
	const { maxData } = protocolLimits(workflow);
	if (encoded.data.length > maxData) {
		throw new Error(`O valor da configuração "${config.base.displayName}" tem ${encoded.data.length} bytes — o máximo que a placa aceita é ${maxData}`);
	}
	return buildLiteralEntry(configId, encoded);
}

// Builds the OUTPUTS section for actionId: one {OUTPUT_ID, TARGET_INSTANCE_ID}
// entry per connection leaving one of its declared output handles. Lets
// STANDALONE/Play navigate the recorded graph on-device without host
// involvement — see PacketCodec.py. TARGET_INSTANCE_ID (not the target's
// ACTION_ID) is what actually identifies which node comes next: two different
// nodes of the same action type (e.g. a "GPIO Write" on an If's True branch and
// another on its False branch) share one ACTION_ID, and only INSTANCE_ID tells
// Standalone/Play's replay guard (Execute::execute's m_expectedInstanceId)
// which of them this packet is. Harmless (just inert extra bytes) when the
// frame is used for a live RUNTIME round-trip instead, since only
// STANDALONE/Play replay reads it.
function buildOutputEntries(workflow: IWorkflowRuntime, actionId: string): Uint8Array {

	const resolved = resolveWorkflowAction(workflow, actionId);
	if (!resolved) return new Uint8Array(0);

	const links: { outputId: number; targetInstanceId: number }[] = [];

	for (const output of getActionOutputs(resolved.action)) {

		// A handle can end up with more than one recorded connection — e.g. a
		// dangling one left over from a deleted action that was never pruned
		// (see RemoveActionFromWorkflowComponent) sitting alongside the real,
		// current one. Try each candidate in order and use the first that
		// actually resolves, instead of giving up on the first (possibly stale)
		// match the way .find() would.
		const candidates = workflow.connections.filter(c => c.source === actionId && c.sourceHandle === output.id);
		const target = candidates
			.map(c => resolveWorkflowAction(workflow, c.target))
			.find((resolvedTarget): resolvedTarget is NonNullable<typeof resolvedTarget> => resolvedTarget !== undefined);
		if (!target) continue;

		links.push({
			outputId: computeWireOutputId(resolved.action, output.base.id),
			targetInstanceId: computeWireInstanceId(target.action),
		});

	}

	const entries = new Uint8Array(links.length * 4);
	const view = new DataView(entries.buffer);
	links.forEach((link, i) => {
		view.setUint16(i * 4, link.outputId, true);
		view.setUint16(i * 4 + 2, link.targetInstanceId, true);
	});

	return entries;

}

// Builds an Execute/Record Command REQUEST payload per packages/hio-system's PacketCodec.py:
// COMMAND_ID + ACTION_ID(16) + INSTANCE_ID(16) + OUTPUTS_SIZE(8) + OUTPUTS +
// [CONFIG_ID(16) + VALUE_TYPE(8) + (LITERAL | BIND | CODE | VARIABLE, see buildConfigEntry)]*
export class GenerateExecuteCommand {

	execute(workflow: IWorkflowRuntime, actionId: string, commandId: number = EXECUTE_COMMAND_ID): Uint8Array | undefined {

		const resolved = resolveWorkflowAction(workflow, actionId);
		if (!resolved) return undefined;

		const { action, componentName, configurations } = resolved;
		const numericActionId = computeWireActionId(componentName, action);
		const numericInstanceId = computeWireInstanceId(action);

		const limits = protocolLimits(workflow);
		const outputEntries = buildOutputEntries(workflow, actionId);
		const outputsCount = outputEntries.length / 4;
		if (outputsCount > limits.maxOutputs) {
			throw new Error(`A ação "${action.base.displayName}" tem ${outputsCount} saídas conectadas — o máximo que a placa aceita é ${limits.maxOutputs}`);
		}

		// A config its displayOptions hide doesn't apply — not sent, so it
		// takes no room (e.g. LCD's parallel pins while it's on I2C).
		const configEntries = configurations
			.filter(c => isConfigurationVisible(c, configurations))
			.filter(c => c.binding !== null || (c.value !== undefined && c.value !== null))
			.map(c => buildConfigEntry(workflow, action.base.displayName, c, componentName === LogicComponentSchema.displayName))
			.filter((entry): entry is Uint8Array => entry !== undefined);
		if (actionId === workflow.start.id) configEntries.push(...buildVariableInitialEntries(workflow));
		// Pass Context on: a flag the board takes out of the configs — without
		// it, the next action gets only what this one published.
		if (actionPassesContext(workflow, actionId)) {
			configEntries.push(buildLiteralEntry(PASS_CONTEXT_CONFIG_ID, encodeBool(true)));
		}
		if (configEntries.length > limits.maxConfigs) {
			throw new Error(`A ação "${action.base.displayName}" tem ${configEntries.length} configurações — o máximo que a placa aceita é ${limits.maxConfigs}`);
		}
		const configBytes = configEntries.reduce((sum, entry) => sum + entry.length, 0);

		const size = 6 + outputEntries.length + configBytes;
		if (size > limits.maxPayload) {
			throw new Error(`A ação "${action.base.displayName}" não cabe num frame: ${size} bytes, o máximo é ${limits.maxPayload}`);
		}

		const payload = new Uint8Array(size);
		payload[0] = commandId;
		new DataView(payload.buffer).setUint16(1, numericActionId, true);
		new DataView(payload.buffer).setUint16(3, numericInstanceId, true);
		payload[5] = outputsCount;
		payload.set(outputEntries, 6);

		let offset = 6 + outputEntries.length;
		for (const entry of configEntries) {
			payload.set(entry, offset);
			offset += entry.length;
		}

		return payload;

	}

}
