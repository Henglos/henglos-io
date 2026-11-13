from ..compat import sleep_ms, ticks_ms, ticks_diff
from ..interfaces.ICommand import ICommand
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId
from ..packets.TriggerPollPacket import TriggerPollPacket
from .ExecuteCommand import ExecuteCommand

# How often the triggers are asked while a TRIGGER_POLL waits.
_POLL_EVERY_MS = 10


# TRIGGER_POLL: the host finished a branch (or never started one) and asks
# whether an armed trigger fired — waiting up to WAIT_MS for one. Answers
# with the INSTANCE_ID of the one that did (0: none) and what it published;
# the flow then points at its Out.
class TriggerPollCommand(ICommand):

	def __init__(self, execute: ExecuteCommand) -> None:
		self._execute = execute

	async def execute(self, packet: TriggerPollPacket, transport: "ITransport | None") -> None:
		execute = self._execute

		# Asking means the host isn't in a branch: one left half-way (a
		# debug session stopped) is over.
		execute.abandon()

		started = ticks_ms()
		while True:
			fired = execute.fire(transport)
			if fired is not None:
				instance_id, results = fired
				respond(transport, packet.frame_id, CommandId.TRIGGER_POLL, instance_id, results)
				return
			if ticks_diff(ticks_ms(), started) >= packet.wait_ms:
				respond(transport, packet.frame_id, CommandId.TRIGGER_POLL, 0)
				return
			await sleep_ms(_POLL_EVERY_MS)
