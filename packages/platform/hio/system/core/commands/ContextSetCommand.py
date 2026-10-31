from ..interfaces.ICommand import ICommand
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, OutputId
from ..packets.ContextSetPacket import ContextSetPacket
from .ExecuteCommand import ExecuteCommand


# CONTEXT_SET: writes values into the run's pipeline — what binds and ctx.get()
# read next. The studio's debugger uses it to change what an action published
# before the next action runs. Answers SUCCESS, or FALLBACK when some value
# didn't fit (the pipeline was full).
class ContextSetCommand(ICommand):

	def __init__(self, execute: ExecuteCommand) -> None:
		self._execute = execute

	async def execute(self, packet: ContextSetPacket, transport: "ITransport | None") -> None:
		stored = self._execute.set_context(packet.configs)
		respond(transport, packet.frame_id, CommandId.CONTEXT_SET, OutputId.SUCCESS if stored else OutputId.FALLBACK)
