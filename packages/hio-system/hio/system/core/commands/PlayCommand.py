from ..interfaces.ICommand import ICommand
from ..interfaces.ITransport import ITransport
from ..packets.PlayPacket import PlayPacket


# Port of the C++ Commands::Play — which was never implemented there either.
class PlayCommand(ICommand):

	async def execute(self, packet: PlayPacket, transport: "ITransport | None") -> None:
		# TODO: run a single action and answer with the data of its outputs,
		# for debugging (the C++ TODO). No response until then — the host
		# times out, same as with the C++ firmware.
		pass
