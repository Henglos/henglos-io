import { CommandId, type ContextValue } from "@henglosio/shared";
import { buildValueEntry, encodeBytes, encodeValue, generateId, type EncodedValue } from "@henglosio/workflow";

// A value as CONTEXT_SET carries it: its DataType and its bytes.
const encode = (value: ContextValue): EncodedValue =>
	value.kind === "bytes" ? encodeBytes(value.value) : encodeValue(value.kind, value.value);

/**
 * A CONTEXT_SET payload: `values` written into what the board holds for the
 * run, each under its name (lowercased, as an action publishes it) — read by
 * the next action as if the ones before it had published them. Entries:
 * CONFIG_ID(16) + DATA_TYPE(8) + [DATA_SIZE(16) if sized] + DATA.
 */
export function buildContextSetPayload(values: ContextValue[]): Uint8Array<ArrayBuffer> {
	const entries = values.map(value => buildValueEntry(generateId(value.name.toLowerCase()), encode(value)));
	const payload = new Uint8Array(1 + entries.reduce((sum, entry) => sum + entry.length, 0));
	payload[0] = CommandId.CONTEXT_SET;
	let offset = 1;
	for (const entry of entries) { payload.set(entry, offset); offset += entry.length; }
	return payload;
}
