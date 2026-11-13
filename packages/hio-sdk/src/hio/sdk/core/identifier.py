# 16-bit id of a name (config, output, "<component>/<action>") — the same hash
# as @henglosio/workflow's generateId (src/utils/identifier.ts), which is what
# the host puts on the wire. Keep the two identical.
def generate_id(name: str) -> int:
	hash = 0x811C
	for byte in name.encode():
		hash ^= byte
		hash = (hash * 0x0101) & 0xFFFF
	return hash


def variable_id(name: str) -> int:
	# VARIABLE_ID of a workflow variable — @henglosio/workflow's
	# computeWireVariableId. Case-insensitive, like the studio's names.
	return generate_id("var/" + name.lower())
