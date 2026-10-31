import type { IWorkflowRuntime } from "../../../domain/entities/IWorkflow.runtime.js";
import type { IConfigurationRuntime } from "../../../domain/entities/IConfiguration.runtime.js";
import type { IBindingSchema, IOutputBindingSchema, IAnyValueSchema, IAnyValueKindSchema, IFileValueSchema, ICredentialValueSchema } from "../../../domain/entities/IConfiguration.schema.js";
import { credentialBoardPath, fileBoardPath } from "./ResolveBoardInstall.use-case.js";
import type { IPinSchema } from "../../../domain/entities/IPin.schema.js";
import { Color } from "../../../domain/value-objects/Color.js";
import { ConfigurationParser } from "../../services/ConfigurationParser.service.js";
import { resolveWorkflowAction, computeWireActionId, computeWireInstanceId } from "./ResolveWorkflowAction.js";
import { computeWireOutputId, getActionOutputs } from "./ResolveNextAction.use-case.js";
import { generateId } from "../../../utils/identifier.js";
import { computeWireVariableId } from "./Variables.use-case.js";
import { protocolLimits } from "../../../domain/value-objects/ProtocolLimits.js";
import { isConfigurationVisible } from "../../services/ConfigurationVisibility.js";
import type { IVariableRuntime } from "../../../domain/entities/IVariable.runtime.js";
import { pythonKind, type IShape } from "../../../domain/schemas/IKSchema.schema.js";
import { validateShape } from "../../../domain/value-objects/ShapeValue.js";
import { actionPassesContext, PASS_CONTEXT_CONFIG_ID } from "./PassContext.use-case.js";
import { LogicComponentSchema } from "../../../domain/value-objects/LogicComponent.js";

// A real runtime global in both the browser and Node — just missing from this
// package's tsconfig "lib" (ESNext only, no DOM), so it's declared narrowly
// here instead of pulling in the whole DOM lib (which apps/web also bundles
// this package into, alongside Node-only consumers like apps/hosting).
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

// REQUEST command ids understood by the firmware (see packages/platform's
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

// DATA TYPE byte (see PacketCodec.py's DataType): high bit is the array flag,
// low 7 bits are the element type ordinal. This table's order must be kept in
// sync with it by hand.
const DATA_TYPE_ARRAY_BIT = 0x80;

// A list or an object: its JSON, UTF-8 — always as an array (PacketCodec.py's
// DataType.JSON). Not an "any" kind: only array/object configs and variables
// (and scripts filling them) carry it.
const DATA_TYPE_JSON = 13;

// A CODE config's RESULT TYPE only (PacketCodec.py's DataType.AUTO): the board
// keeps the type the script returned. For Logic's operands — they compare
// whatever comes (Logic.py), and a number returned stays a number — and for
// every "any" config (Variables' Set / Append / Set Field Value…).
const DATA_TYPE_AUTO = 14;

const encodeJson = (value: unknown): EncodedValue =>
	({ dataType: DATA_TYPE_JSON, isArray: true, data: new TextEncoder().encode(JSON.stringify(value)) });

// The wire's element types (PacketCodec.py's DataType) — only the ones the
// host sends. A MicroPython type goes as the one the board itself answers
// with (Context.py's encode_value): int → INT_32, float → FLOAT_32.
const WIRE_TYPE = {
	uint8: 0,
	uint16: 1,
	int32: 8,
	float32: 11,
	bool: 12,
} as const;

const WIRE_KIND: Record<IAnyValueKindSchema, number> = {
	int: WIRE_TYPE.int32,
	float: WIRE_TYPE.float32,
	bool: WIRE_TYPE.bool,
};

// An "any" config's tagged value ({ kind, value }) as its bytes. A value saved
// under an old type name (int32, uint8…) goes as the MicroPython type it is.
function encodeAnyValue(rawKind: IAnyValueKindSchema, value: number | boolean): Uint8Array {
	const kind = pythonKind(rawKind);
	const data = new Uint8Array(kind === "bool" ? 1 : 4);
	const view = new DataView(data.buffer);

	switch (kind) {
		case "bool": data[0] = value ? 1 : 0; return data;
		case "int": view.setInt32(0, Math.trunc(value as number), true); return data;
		case "float": view.setFloat32(0, value as number, true); return data;
		default: throw new Error(`Tipo desconhecido para um valor "any": "${String(rawKind)}"`);
	}
}

type EncodedValue = { dataType: number; isArray: boolean; data: Uint8Array };

function encodeConfigurationValue(config: IConfigurationRuntime): EncodedValue {
	switch (config.base.type) {

		case "toggle":
			return { dataType: WIRE_TYPE.bool, isArray: false, data: new Uint8Array([config.value ? 1 : 0]) };

		case "number": {
			const [, result, matched] = ConfigurationParser.parse(String(config.value), ConfigurationParser.pipesFor(config.base));
			if (!matched) throw new Error(`Não foi possível calcular a expressão da configuração "${config.base.displayName}": ${config.value}`);

			const data = new Uint8Array(4);
			new DataView(data.buffer).setFloat32(0, result as number, true);
			return { dataType: WIRE_TYPE.float32, isArray: false, data };
		}

		case "color": {
			// RGBA — 4 channel bytes, modeled as an array of uint8 (there's no
			// dedicated "color" DataType on the wire).
			const color = Color.fromHex(config.value as string);
			return { dataType: WIRE_TYPE.uint8, isArray: true, data: new Uint8Array([color.R, color.G, color.B, color.A]) };
		}

		case "pin": {
			const pin = config.value as IPinSchema;
			return { dataType: WIRE_TYPE.uint8, isArray: false, data: new Uint8Array([pin.gpio & 0xff]) };
		}

		case "any": {
			const anyValue = config.value as IAnyValueSchema;
			// AnyValueSchema.value is a bare number|boolean today — no array
			// literal support yet (see AnyValueSchema in IConfiguration.schema.ts),
			// so an "any" config is always a single element, never an array.
			return { dataType: WIRE_KIND[pythonKind(anyValue.kind)], isArray: false, data: encodeAnyValue(anyValue.kind, anyValue.value) };
		}

		case "bytes":
			// Raw byte array — an array of uint8, same wire shape as text, but
			// the value is already a number[] (0-255 each), not UTF-8 text.
			return { dataType: WIRE_TYPE.uint8, isArray: true, data: Uint8Array.from(config.value as number[]) };

		case "file":
			// The file itself reaches the board with the components (see
			// ResolveBoardInstall): the config carries where — its path, as text.
			return { dataType: WIRE_TYPE.uint8, isArray: true, data: new TextEncoder().encode(fileBoardPath(config.value as IFileValueSchema)) };

		case "credential":
			// Same for a credential: its values are put on the board by the
			// hosting — the config carries their file's path, never the values.
			return { dataType: WIRE_TYPE.uint8, isArray: true, data: new TextEncoder().encode(credentialBoardPath((config.value as ICredentialValueSchema).credentialId)) };

		case "array":
		case "object":
			return encodeJson(config.value);

		case "string":
		case "password":
		case "options":
		default:
			// Text — an array of uint8 (there's no dedicated STRING DataType,
			// see HIOSDK::Common::DataType).
			return { dataType: WIRE_TYPE.uint8, isArray: true, data: new TextEncoder().encode(config.value as string) };
	}
}

// CONFIG_ID: config.base.id when the schema sets one explicitly (an escape
// hatch for a config the firmware needs to match by a raw literal id instead
// of the hashed name — unused today, see IConfigurationSchema.id), otherwise
// generateId(`${actionName}/${displayName}` lowercased) — the firmware side
// must then match it via Util::findConfig(configs, "<actionSlug>/<configSlug>")
// using the same lowercased strings (see GPIOAction.cpp for the pattern).
function computeWireConfigId(actionName: string, config: IConfigurationRuntime): number {
	if (config.base.id !== undefined) return config.base.id;
	return generateId(`${actionName}/${config.base.displayName}`.toLowerCase());
}

// A BIND's source isn't a config — it's a named entry in the source action's
// outputSchema (the values an action actually produces at runtime, e.g. GPIO
// Read's "value"), which has no per-action prefix on the wire: firmware tags a
// result payload with generateId(outputSchema.name) directly (see
// GPIOReadAction.cpp's `Util::generateId("value")`), not
// generateId(`${actionName}/${name}`) like configs do.
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
// representation at all: the on-device Context only ever holds values an
// action's IAction::execute() explicitly published as its result (see
// Execute::execute's m_context.merge), never another action's input configs —
// there is nothing a SOURCE_ID could point at. Treat it the same as a dangling
// bind (undefined) rather than reading a field this shape doesn't have.
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

// A CODE config's script is MicroPython source run on-device (see the
// firmware's ScriptEngine.py), so whatever it returns is coerced into this
// RESULT TYPE byte before it's usable (see PacketCodec.py's CodeLink) — same
// shape as LITERAL's DATA TYPE byte: high bit is the array flag, low 7 bits are
// the element type. Only types ScriptEngine knows how to produce are eligible:
//  - scalar (no array bit) — BOOL/INT*/UINT*/FLOAT_32, never the *8/*16
//    float variants.
//  - UINT_8 with the array bit set — the return value must be a str (same
//    shape "string"/"password"/"options" already carry as a LITERAL), bytes,
//    or a list of 0-255 ints (same shape "bytes"/"color" already carry — e.g.
//    [255, 0, 0, 255] for an RGBA color). No other element type supports the
//    array bit.
// "code" (the Monaco script field itself) has no case here on purpose — a
// script computing the script to run doesn't mean anything.
function resolveCodeResultType(config: IConfigurationRuntime): number | undefined {
	switch (config.base.type) {

		case "toggle": return WIRE_TYPE.bool;
		case "number": return WIRE_TYPE.float32;

		// Same shape a literal `pin.gpio & 0xff` already carries — see
		// encodeConfigurationValue's "pin" case.
		case "pin": return WIRE_TYPE.uint8;

		case "string":
		case "password":
		case "options":
		case "bytes":
		case "color":
			return WIRE_TYPE.uint8 | DATA_TYPE_ARRAY_BIT;

		// The script returns a list / a dict — ScriptEngine turns it into its JSON.
		case "array":
		case "object":
			return DATA_TYPE_JSON | DATA_TYPE_ARRAY_BIT;

		// "any" takes whatever the script returns, as it returns it (AUTO): a
		// literal's kind (value.kind) says nothing about a script — Variables'
		// Set with `return True` would be refused for not being its int32.
		case "any":
			return DATA_TYPE_AUTO;

		default: return undefined;

	}
}

// A workflow variable by its id, or undefined (with a warning) when it's gone —
// the binding / Set that pointed at it is then dropped, like a dangling bind.
function resolveVariable(workflow: IWorkflowRuntime, variableId: string, configName: string) {
	const variable = (workflow.variables ?? []).find(v => v.id === variableId);
	return variable;
}

// LITERAL entry bytes: CONFIG_ID(16) + 0x00 + DATA_TYPE(8) + [DATA_SIZE(16) if array] + DATA
function buildLiteralEntry(configId: number, { dataType, isArray, data }: EncodedValue): Uint8Array {
	const entry = new Uint8Array(4 + (isArray ? 2 : 0) + data.length);
	const view = new DataView(entry.buffer);
	view.setUint16(0, configId, true);
	entry[2] = VALUE_TYPE_LITERAL;
	entry[3] = dataType | (isArray ? DATA_TYPE_ARRAY_BIT : 0);

	let offset = 4;
	if (isArray) {
		view.setUint16(offset, data.length, true);
		offset += 2;
	}

	entry.set(data, offset);
	return entry;
}

// A variable's value in the DataType its type maps to (see IVariable.runtime.ts).
function encodeVariableValue(variable: IVariableRuntime): EncodedValue {
	const value = variable.initial!;
	switch (variable.type) {
		case "boolean": return { dataType: WIRE_TYPE.bool, isArray: false, data: encodeAnyValue("bool", value as boolean) };
		case "integer": return { dataType: WIRE_TYPE.int32, isArray: false, data: encodeAnyValue("int", value as number) };
		case "number": return { dataType: WIRE_TYPE.float32, isArray: false, data: encodeAnyValue("float", value as number) };
		case "text": return { dataType: WIRE_TYPE.uint8, isArray: true, data: new TextEncoder().encode(value as string) };
		case "array":
		case "object": return encodeJson(value);
	}
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
			const encoded = encodeVariableValue(variable);
			// A text initial value set under a bigger MAX_DATA_BUFFER than the workflow has now.
			if (encoded.data.length > maxData) {
				throw new Error(`O valor inicial da variável "${variable.name}" tem ${encoded.data.length} bytes — o máximo que a placa aceita é ${maxData}`);
			}
			return buildLiteralEntry(computeWireVariableId(variable.name), encoded);
		});
}

// LITERAL:  CONFIG_ID(16) + VALUE_TYPE(8)=0x00 + DATA_TYPE(8) + [DATA_SIZE(16) if array] + DATA
// BIND:     CONFIG_ID(16) + VALUE_TYPE(8)=0x01 + SOURCE_ID(16)
// CODE:     CONFIG_ID(16) + VALUE_TYPE(8)=0x02 + RESULT_TYPE(8) + CODE_SIZE(16) + CODE
// VARIABLE: CONFIG_ID(16) + VALUE_TYPE(8)=0x04 + VARIABLE_ID(16)
function buildConfigEntry(workflow: IWorkflowRuntime, actionName: string, config: IConfigurationRuntime, logic = false): Uint8Array | undefined {

	const configId = computeWireConfigId(actionName, config);

	if (config.binding && "variableId" in config.binding) {

		const variable = resolveVariable(workflow, config.binding.variableId, config.base.displayName);
		if (!variable) return undefined;

		const entry = new Uint8Array(5);
		const view = new DataView(entry.buffer);
		view.setUint16(0, configId, true);
		entry[2] = VALUE_TYPE_VARIABLE;
		view.setUint16(3, computeWireVariableId(variable.name), true);
		return entry;

	}

	// A "variable" config (Variables / Set's target) carries which variable as
	// its VARIABLE_ID — a LITERAL uint16.
	if (!config.binding && config.base.type === "variable") {

		const variable = resolveVariable(workflow, config.value as string, config.base.displayName);
		if (!variable) return undefined;

		const data = new Uint8Array(2);
		new DataView(data.buffer).setUint16(0, computeWireVariableId(variable.name), true);
		return buildLiteralEntry(configId, { dataType: WIRE_TYPE.uint16, isArray: false, data });

	}

	if (config.binding && "code" in config.binding) {

		const resultType = logic && config.base.type === "string" ? DATA_TYPE_AUTO : resolveCodeResultType(config);
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

		const entry = new Uint8Array(5);
		const view = new DataView(entry.buffer);
		view.setUint16(0, configId, true);
		entry[2] = VALUE_TYPE_BIND;
		view.setUint16(3, sourceId, true);
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
	if (config.base.type === "array" || config.base.type === "object") {
		const shape: IShape = config.base.type === "array"
			? { array: config.base.items }
			: { object: Object.fromEntries(config.base.fields.map(field => [field.name, field.type])) };
		const problem = validateShape(shape, config.value);
		if (problem) throw new Error(`A configuração "${config.base.displayName}" tem um valor inválido — ${problem}`);
		if (config.base.type === "array" && config.base.maxItems !== undefined && (config.value as unknown[]).length > config.base.maxItems) {
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

// Builds an Execute/Record Command REQUEST payload per packages/platform's PacketCodec.py:
// COMMAND_ID + ACTION_ID(16) + INSTANCE_ID(16) + OUTPUTS_SIZE(8) + OUTPUTS +
// [CONFIG_ID(16) + VALUE_TYPE(8) + (LITERAL: DATA_TYPE(8)+[DATA_SIZE(16) if array]+DATA | BIND: SOURCE_ID(16))]*
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
			configEntries.push(buildLiteralEntry(PASS_CONTEXT_CONFIG_ID, { dataType: WIRE_TYPE.bool, isArray: false, data: new Uint8Array([1]) }));
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
