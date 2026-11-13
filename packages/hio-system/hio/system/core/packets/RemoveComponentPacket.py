from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import CommandId


# REQUEST REMOVE_COMPONENT — drop one stored component. Body:
#   NAME_LEN(8) + NAME
# NAME is the component's "<namespace>/<name>".
class RemoveComponentPacket(IPacket):

	COMMAND_ID = CommandId.REMOVE_COMPONENT

	def __init__(self, frame_id: int, name: str) -> None:
		self.frame_id = frame_id
		self.name = name

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "RemoveComponentPacket | None":

		if len(body) < 1:
			return None

		name_len = body[0]
		if 1 + name_len > len(body):
			return None

		# Copied into a str on purpose: the name is used as a storage key
		# after the frame's buffer is gone.
		return RemoveComponentPacket(frame_id, bytes(body[1:1 + name_len]).decode())
