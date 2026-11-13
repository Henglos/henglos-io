from ..interfaces.ICommand import ICommand
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, StreamStatus
from ..packets.StreamPacket import StreamPacket


# A REQUEST STREAM reaching the main loop: no action is reading a stream right
# now (those chunks never get here — BatchStream reads them), so it belongs to
# one that already ended or never existed. Answered NOT_FOUND so the host stops
# sending — never run as anything else.
class StreamCommand(ICommand):

	async def execute(self, packet: StreamPacket, transport: "ITransport | None") -> None:
		respond(transport, packet.frame_id, CommandId.STREAM, StreamStatus.NOT_FOUND)
