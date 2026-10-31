from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import CommandId


# REQUEST PLAY — replay the stored program. No body.
class PlayPacket(IPacket):

	COMMAND_ID = CommandId.PLAY

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "PlayPacket":
		return PlayPacket(frame_id)
