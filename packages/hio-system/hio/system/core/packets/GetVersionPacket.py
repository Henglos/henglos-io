from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import CommandId


# REQUEST GET_VERSION — ask for the firmware version. No body.
class GetVersionPacket(IPacket):

	COMMAND_ID = CommandId.GET_VERSION

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "GetVersionPacket":
		return GetVersionPacket(frame_id)
