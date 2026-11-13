from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import (
	CommandId, Config, u16, fixed_size, is_sized, is_data_type,
	MAX_CONFIGS_PER_COMMAND, MAX_DATA_BUFFER,
)


# REQUEST CONTEXT_SET — overwrite values the run holds (the studio's debugger,
# editing what an action published before the next one reads it). Body: the
# entries to write, until the end of the body, each one
#
#   CONFIG_ID(16) + DATA_TYPE(8) + [DATA_SIZE(16) only if sized] + DATA
#
# — a LITERAL config entry (see ActionBody) without its VALUE_TYPE byte.
class ContextSetPacket(IPacket):

	COMMAND_ID = CommandId.CONTEXT_SET

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id
		self.configs = []

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "ContextSetPacket | None":
		packet = ContextSetPacket(frame_id)
		size = len(body)
		index = 0

		while index < size:
			if index + 3 > size:
				return None

			config_id = u16(body, index)
			data_type = body[index + 2]
			index += 3

			if not is_data_type(data_type):
				return None

			if is_sized(data_type):
				if index + 2 > size:
					return None
				data_size = u16(body, index)
				index += 2
			else:
				data_size = fixed_size(data_type)

			if data_size > MAX_DATA_BUFFER or index + data_size > size:
				return None

			if len(packet.configs) < MAX_CONFIGS_PER_COMMAND:
				packet.configs.append(Config(config_id, data_type, body[index:index + data_size]))
			index += data_size

		return packet
