from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import CommandId


# REQUEST FINISH_RECORD — close the recording and persist it. No body.
class FinishRecordPacket(IPacket):

	COMMAND_ID = CommandId.FINISH_RECORD

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "FinishRecordPacket":
		return FinishRecordPacket(frame_id)
