from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import CommandId


# REQUEST STANDALONE — start replaying the stored program on its own. No body.
class StandalonePacket(IPacket):

	COMMAND_ID = CommandId.STANDALONE

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "StandalonePacket":
		return StandalonePacket(frame_id)
