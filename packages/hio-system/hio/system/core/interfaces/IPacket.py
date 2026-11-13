from micropython import const

class IPacket:
	# One command's packet: how its frame body decodes into it, and how its
	# answer encodes. `COMMAND_ID` is the command it's for (PacketCodec.CommandId).

	COMMAND_ID: int = const(0)

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> IPacket | None: 
		raise NotImplementedError

	def encode(self) -> bytes | None: 
		raise NotImplementedError
