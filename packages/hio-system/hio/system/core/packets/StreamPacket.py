from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import PacketCodec, CommandId, FrameType, put_u16, u16


# REQUEST STREAM — one chunk of a STREAM config, read by the action that's
# running (HIOAction.batch), never dispatched as a command of its own — see
# PacketCodec's STREAMS. Body:
#   STREAM_REF(16) + CONFIG_ID(16) + CHUNK
class StreamPacket(IPacket):

	COMMAND_ID = CommandId.STREAM

	def __init__(self, frame_id: int, stream_ref: int, config_id: int, chunk: "memoryview | bytes") -> None:
		self.frame_id = frame_id            # this chunk's own id — echoed back in its response
		self.stream_ref = stream_ref        # FRAME_ID of the EXECUTE that declared the stream
		self.config_id = config_id
		self.chunk = chunk                  # view into the frame buffer — only valid until the OK

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "StreamPacket | None":

		if len(body) < 4:
			return None

		return StreamPacket(frame_id, u16(body, 0), u16(body, 2), body[4:])

	def encode(self) -> bytes:
		payload = bytearray()
		payload.append(StreamPacket.COMMAND_ID)
		put_u16(payload, self.stream_ref)
		put_u16(payload, self.config_id)
		payload.extend(self.chunk)
		return PacketCodec.build_frame(FrameType.REQUEST, self.frame_id, payload)
