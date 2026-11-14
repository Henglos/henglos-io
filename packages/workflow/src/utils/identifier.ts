// A real runtime global in both the browser and Node — declared narrowly
// instead of pulling in the DOM lib (see GenerateExecuteCommand.use-case.ts).
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

// 16-bit id of a name (config, output, "<component>/<action>"). Hashes the
// name's UTF-8 bytes — the same as the firmware's generate_id
// (packages/hio-sdk/src/henglosio/sdk/core/identifier.py), so a non-ASCII name (an
// accented display name) gets the same id on both sides. Keep the two identical.
export const generateId = (name: string): number => {
	let hash = 0x811c;

	for (const byte of new TextEncoder().encode(name)) {
		hash ^= byte;
		hash = (hash * 0x0101) & 0xffff;
	}

	return hash;
};
