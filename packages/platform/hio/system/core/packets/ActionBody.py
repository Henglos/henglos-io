# Body shared by ExecutePacket and RecordPacket — each command keeps its own
# class, only the wire format of the body lives here once.
#
#   ACTION_ID(16) + INSTANCE_ID(16) + OUTPUTS_SIZE(8)
#   + OUTPUTS_SIZE x [OUTPUT_ID(16) + TARGET_INSTANCE_ID(16)]
#   + CONFIGS until the end of the body, each one:
#       CONFIG_ID(16) + VALUE_TYPE(8) + BODY
#         LITERAL (0x00): DATA_TYPE(8) + [DATA_SIZE(16) only if array] + DATA
#         BIND    (0x01): SOURCE_ID(16)
#         CODE    (0x02): RESULT_TYPE(8) + CODE_SIZE(16) + CODE
#                         CODE is MicroPython source run on the device (see
#                         ScriptEngine); its `return` value is coerced into
#                         RESULT_TYPE
#         STREAM  (0x03): DATA_TYPE(8) + TOTAL_SIZE(16) — no value here, it
#                         arrives afterwards as REQUEST STREAM chunks (see
#                         PacketCodec's STREAMS); TOTAL_SIZE 0 = open-ended
#         VARIABLE(0x04): VARIABLE_ID(16) — the value of a workflow variable
#                         (GlobalVariables) when the action runs, like BIND
#                         reads a published output
#   DATA_TYPE / RESULT_TYPE: bit 0x80 is the array flag, low 7 bits the element
#   type (DataType). A non-array LITERAL is exactly size_of_data_type(element)
#   bytes, so it carries no DATA_SIZE.
#
# ACTION_ID identifies the action TYPE (generateId("<component>/<action>"),
# shared by every instance of it); INSTANCE_ID identifies this one graph-node
# occurrence.

from ..services.PacketCodec import (
	u16, put_u16, size_of_data_type,
	DataType, ConfigValueType,
	OutputLink, BindLink, CodeLink, StreamLink, VariableLink, Config,
	MAX_OUTPUTS_PER_ACTION, MAX_CONFIGS_PER_COMMAND, MAX_DATA_BUFFER, MAX_CODE_BUFFER, MAX_PAYLOAD_SIZE,
)

# Default for list fields a packet may not use. The empty tuple is a single
# shared object — no heap allocation per packet, and it still iterates like
# an empty list. A real list is only created when the first entry shows up.
EMPTY = ()


def decode_action_body(packet, body: memoryview) -> bool:
	# Fills packet.action_id/instance_id/outputs/binds/variables/codes/streams/configs. Any field
	# that would read past the body rejects the whole packet — skipping just
	# one entry would desync every read after it.

	size = len(body)

	if size < 5:
		return False

	packet.action_id = u16(body, 0)
	packet.instance_id = u16(body, 2)
	outputs_size = body[4]
	index = 5

	if outputs_size > MAX_OUTPUTS_PER_ACTION or index + outputs_size * 4 > size:
		return False

	if outputs_size:
		packet.outputs = []
		for _ in range(outputs_size):
			packet.outputs.append(OutputLink(u16(body, index), u16(body, index + 2)))
			index += 4

	while index < size:

		if index + 3 > size:
			return False

		config_id = u16(body, index)
		value_type = body[index + 2]
		index += 3

		if value_type == ConfigValueType.BIND:

			if index + 2 > size:
				return False

			if packet.binds is EMPTY:
				packet.binds = []
			if len(packet.binds) < MAX_CONFIGS_PER_COMMAND:
				packet.binds.append(BindLink(config_id, u16(body, index)))

			index += 2

		elif value_type == ConfigValueType.VARIABLE:

			if index + 2 > size:
				return False

			if packet.variables is EMPTY:
				packet.variables = []
			if len(packet.variables) < MAX_CONFIGS_PER_COMMAND:
				packet.variables.append(VariableLink(config_id, u16(body, index)))

			index += 2

		elif value_type == ConfigValueType.LITERAL:

			if index + 1 > size:
				return False

			type_byte = body[index]
			index += 1

			element_type = type_byte & DataType.ELEMENT_MASK
			is_array = (type_byte & DataType.ARRAY_BIT) != 0
			data_size = size_of_data_type(element_type)

			if data_size == 0:
				return False

			if is_array:
				if index + 2 > size:
					return False
				data_size = u16(body, index)
				index += 2

			if data_size > MAX_DATA_BUFFER or index + data_size > size:
				return False

			if packet.configs is EMPTY:
				packet.configs = []
			if len(packet.configs) < MAX_CONFIGS_PER_COMMAND:
				packet.configs.append(Config(config_id, element_type, body[index:index + data_size], is_array))

			index += data_size

		elif value_type == ConfigValueType.CODE:

			if index + 3 > size:
				return False

			type_byte = body[index]
			code_size = u16(body, index + 1)
			index += 3

			if code_size > MAX_CODE_BUFFER or index + code_size > size:
				return False

			if packet.codes is EMPTY:
				packet.codes = []
			if len(packet.codes) < MAX_CONFIGS_PER_COMMAND:
				packet.codes.append(CodeLink(
					config_id,
					type_byte & DataType.ELEMENT_MASK,
					(type_byte & DataType.ARRAY_BIT) != 0,
					body[index:index + code_size],
				))

			index += code_size

		elif value_type == ConfigValueType.STREAM:

			if index + 3 > size:
				return False

			data_type = body[index]
			element_size = size_of_data_type(data_type)
			total_size = u16(body, index + 1)
			index += 3

			# Chunks must carry whole elements, so the total must too.
			if element_size == 0 or total_size % element_size:
				return False

			if packet.streams is EMPTY:
				packet.streams = []
			if len(packet.streams) < MAX_CONFIGS_PER_COMMAND:
				packet.streams.append(StreamLink(config_id, data_type, total_size))

		else:
			return False

	return True


def encode_action_body(packet, payload: bytearray) -> None:
	# Appends the body to `payload` (which already holds COMMAND_ID). Entries
	# that don't fit MAX_PAYLOAD_SIZE are dropped, not split.

	put_u16(payload, packet.action_id)
	put_u16(payload, packet.instance_id)

	payload.append(len(packet.outputs))
	for output in packet.outputs:
		put_u16(payload, output.output_id)
		put_u16(payload, output.target_instance_id)

	for bind in packet.binds:
		if len(payload) + 5 > MAX_PAYLOAD_SIZE:
			break
		put_u16(payload, bind.config_id)
		payload.append(ConfigValueType.BIND)
		put_u16(payload, bind.source_id)

	for link in packet.variables:
		if len(payload) + 5 > MAX_PAYLOAD_SIZE:
			break
		put_u16(payload, link.config_id)
		payload.append(ConfigValueType.VARIABLE)
		put_u16(payload, link.variable_id)

	for code in packet.codes:
		if len(payload) + 6 + len(code.code) > MAX_PAYLOAD_SIZE:
			break
		put_u16(payload, code.config_id)
		payload.append(ConfigValueType.CODE)
		payload.append(code.result_type | (DataType.ARRAY_BIT if code.is_array else 0))
		put_u16(payload, len(code.code))
		payload.extend(code.code)

	for stream in packet.streams:
		if len(payload) + 6 > MAX_PAYLOAD_SIZE:
			break
		put_u16(payload, stream.config_id)
		payload.append(ConfigValueType.STREAM)
		payload.append(stream.data_type)
		put_u16(payload, stream.total_size)

	for config in packet.configs:

		# A single element is exactly size_of_data_type() bytes — anything
		# else is an array, and so is anything already flagged as one (a
		# 1-byte string). The array flag and DATA_SIZE travel together.
		is_array = config.is_array or len(config.data) != size_of_data_type(config.data_type)
		entry_size = 4 + (2 if is_array else 0) + len(config.data)

		if len(payload) + entry_size > MAX_PAYLOAD_SIZE:
			break

		put_u16(payload, config.config_id)
		payload.append(ConfigValueType.LITERAL)
		payload.append(config.data_type | (DataType.ARRAY_BIT if is_array else 0))

		if is_array:
			put_u16(payload, len(config.data))

		payload.extend(config.data)
