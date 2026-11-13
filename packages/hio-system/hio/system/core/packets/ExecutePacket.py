from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import PacketCodec, CommandId, FrameType
from .ActionBody import EMPTY, decode_action_body, encode_action_body


# REQUEST EXECUTE — run one action now. Body: see ActionBody.
class ExecutePacket(IPacket):

	COMMAND_ID = CommandId.EXECUTE

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
	def decode(frame_id: int, body: memoryview) -> "ExecutePacket | None":
		packet = ExecutePacket(frame_id)
		return packet if decode_action_body(packet, body) else None

	def encode(self) -> bytes:
		payload = bytearray()
		payload.append(ExecutePacket.COMMAND_ID)
		encode_action_body(self, payload)
		return PacketCodec.build_frame(FrameType.REQUEST, self.frame_id, payload)
