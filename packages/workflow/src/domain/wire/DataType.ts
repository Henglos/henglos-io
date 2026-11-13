// A value's type on the wire — the platform's PacketCodec.py DataType, keep
// them in sync. The ones MicroPython has, nothing narrower:
//   INTEGER  int32 little-endian (4 bytes)     → a Python int
//   FLOAT    float32 little-endian (4 bytes)   → a Python float
//   BOOL     1 byte, 0 or 1                    → a Python bool
//   STRING   UTF-8                             → a Python str
//   LIST     its JSON                          → a Python list
//   OBJECT   its JSON                          → a Python dict
//   BYTES    raw bytes                         → bytes (a file's path, a color's RGBA…)
// The first three are fixed-size; the rest carry DATA_SIZE(16) before their
// data wherever a value is written out (a LITERAL, a CONTEXT_SET entry).
//
// AUTO is only an EXPECTED_TYPE / RESULT_TYPE: the board keeps the value as
// the type it already is (a script's return, a bind into an "any").

// TextEncoder: a runtime global in both the browser and Node, missing from
// this package's tsconfig lib (no DOM) — see GenerateExecuteCommand.
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

export const DataType = {
	INTEGER: 0,
	FLOAT: 1,
	BOOL: 2,
	STRING: 3,
	LIST: 4,
	OBJECT: 5,
	BYTES: 6,
	AUTO: 0x0f,
} as const;

export type IDataType = (typeof DataType)[keyof typeof DataType];

/** The types a value can be — the ones the user picks (BYTES never is: it's only what some configs carry). */
export const VALUE_TYPES = ["integer", "float", "bool", "string", "list", "object"] as const;
export type IValueType = (typeof VALUE_TYPES)[number];

/** Each value type's DataType. */
export const VALUE_DATA_TYPE: Record<IValueType, IDataType> = {
	integer: DataType.INTEGER,
	float: DataType.FLOAT,
	bool: DataType.BOOL,
	string: DataType.STRING,
	list: DataType.LIST,
	object: DataType.OBJECT,
};

/** int32's range — what an integer can hold on the board. */
export const INTEGER_RANGE: [number, number] = [-0x80000000, 0x7fffffff];

/** Whether a value of `dataType` carries its DATA_SIZE (STRING, LIST, OBJECT, BYTES). */
export const isSizedDataType = (dataType: number): boolean => dataType >= DataType.STRING && dataType <= DataType.BYTES;

/** A value ready for the wire: its DataType and its bytes. */
export type EncodedValue = { dataType: IDataType; data: Uint8Array };

export const encodeInteger = (value: number): EncodedValue => {
	const data = new Uint8Array(4);
	new DataView(data.buffer).setInt32(0, Math.trunc(value), true);
	return { dataType: DataType.INTEGER, data };
};

export const encodeFloat = (value: number): EncodedValue => {
	const data = new Uint8Array(4);
	new DataView(data.buffer).setFloat32(0, value, true);
	return { dataType: DataType.FLOAT, data };
};

export const encodeBool = (value: boolean): EncodedValue => ({ dataType: DataType.BOOL, data: new Uint8Array([value ? 1 : 0]) });

export const encodeString = (value: string): EncodedValue => ({ dataType: DataType.STRING, data: new TextEncoder().encode(value) });

export const encodeBytes = (value: ArrayLike<number>): EncodedValue => ({ dataType: DataType.BYTES, data: Uint8Array.from(value) });

/** A list or an object — as its JSON (LIST for an array, OBJECT for anything else). */
export const encodeJson = (value: unknown): EncodedValue =>
	({ dataType: Array.isArray(value) ? DataType.LIST : DataType.OBJECT, data: new TextEncoder().encode(JSON.stringify(value)) });

/** A value of `type` as its DataType's bytes. */
export function encodeValue(type: IValueType, value: unknown): EncodedValue {
	switch (type) {
		case "integer": return encodeInteger(value as number);
		case "float": return encodeFloat(value as number);
		case "bool": return encodeBool(value as boolean);
		case "string": return encodeString(value as string);
		case "list":
		case "object": return encodeJson(value);
	}
}

/**
 * A LITERAL-style entry: CONFIG_ID(16) + [VALUE_TYPE(8)] + DATA_TYPE(8) +
 * [DATA_SIZE(16) if sized] + DATA. `valueType` is the LITERAL's VALUE_TYPE
 * byte inside an EXECUTE; a CONTEXT_SET entry has none (undefined).
 */
export function buildValueEntry(configId: number, { dataType, data }: EncodedValue, valueType?: number): Uint8Array {
	const sized = isSizedDataType(dataType);
	const head = valueType === undefined ? 3 : 4;
	const entry = new Uint8Array(head + (sized ? 2 : 0) + data.length);
	const view = new DataView(entry.buffer);
	view.setUint16(0, configId, true);
	if (valueType !== undefined) entry[2] = valueType;
	entry[head - 1] = dataType;
	let offset = head;
	if (sized) {
		view.setUint16(offset, data.length, true);
		offset += 2;
	}
	entry.set(data, offset);
	return entry;
}
