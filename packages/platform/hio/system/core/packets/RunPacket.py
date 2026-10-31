from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import PacketCodec, CommandId, FrameType
from .ActionBody import EMPTY, decode_action_body, encode_action_body


# REQUEST RUN — run one action on its own, outside the program's flow (the
# studio's ▶ on a node). Same body as ExecutePacket (see ActionBody): configs,
# binds, variables and scripts resolve exactly as for an EXECUTE. What differs
# is in ExecuteCommand.run: no INSTANCE_ID sequencing, the flow's position is
# left alone, and it's never archived while recording.
class RunPacket(IPacket):

	COMMAND_ID = CommandId.RUN

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id
		self.action_id = 0
		self.instance_id = 0
		self.outputs = EMPTY        # OutputLink — carried, unused: a RUN doesn't move the flow
		self.binds = EMPTY          # BindLink
		self.variables = EMPTY      # VariableLink
		self.codes = EMPTY          # CodeLink
		self.streams = EMPTY        # StreamLink
		self.configs = EMPTY        # Config (literals)

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "RunPacket | None":
		packet = RunPacket(frame_id)
		return packet if decode_action_body(packet, body) else None

	def encode(self) -> bytes:
		payload = bytearray()
		payload.append(RunPacket.COMMAND_ID)
		encode_action_body(self, payload)
		return PacketCodec.build_frame(FrameType.REQUEST, self.frame_id, payload)
