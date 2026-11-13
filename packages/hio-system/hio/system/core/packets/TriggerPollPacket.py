from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import CommandId, u16

# Longest a TRIGGER_POLL may wait — the host's own timeout must outlast it.
MAX_WAIT_MS = 60000


# REQUEST TRIGGER_POLL — the host is between branches: did an armed trigger
# fire? Body:
#
#   WAIT_MS(16) — how long to wait for one: 0 only checks, up to MAX_WAIT_MS.
#
# RESPONSE: ID = INSTANCE_ID of the trigger that fired (0: none did), DATA =
# what it published. The flow then points at its Out: the host walks that
# branch with EXECUTEs, as it does from Start.
class TriggerPollPacket(IPacket):

	COMMAND_ID = CommandId.TRIGGER_POLL

	def __init__(self, frame_id: int, wait_ms: int = 0) -> None:
		self.frame_id = frame_id
		self.wait_ms = wait_ms

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "TriggerPollPacket | None":
		if len(body) < 2:
			return None
		return TriggerPollPacket(frame_id, min(u16(body, 0), MAX_WAIT_MS))
