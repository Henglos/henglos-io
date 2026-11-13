from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import CommandId


# REQUEST ERASE_RECORD — delete the stored program. No body.
class EraseRecordPacket(IPacket):

	COMMAND_ID = CommandId.ERASE_RECORD

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "EraseRecordPacket":
		return EraseRecordPacket(frame_id)
