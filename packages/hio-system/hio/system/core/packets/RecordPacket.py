from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import PacketCodec, CommandId, FrameType
from .ActionBody import EMPTY, decode_action_body, encode_action_body


# REQUEST RECORD — append one action to the in-progress recording. Same body
# as ExecutePacket: see ActionBody.
class RecordPacket(IPacket):

	COMMAND_ID = CommandId.RECORD

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id
		self.action_id = 0
		self.instance_id = 0
		self.outputs = EMPTY        # OutputLink
		self.binds = EMPTY          # BindLink
		self.variables = EMPTY      # VariableLink
		self.codes = EMPTY          # CodeLink
		self.streams = EMPTY        # StreamLink
		self.configs = EMPTY        # Config (literals)

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "RecordPacket | None":
		packet = RecordPacket(frame_id)
		return packet if decode_action_body(packet, body) else None

	def encode(self) -> bytes:
		payload = bytearray()
		payload.append(RecordPacket.COMMAND_ID)
		encode_action_body(self, payload)
		return PacketCodec.build_frame(FrameType.REQUEST, self.frame_id, payload)
