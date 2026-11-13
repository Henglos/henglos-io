from ..compat import TYPE_CHECKING
from ..interfaces.ICommand import ICommand
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, OutputId
from ..packets.FinishRecordPacket import FinishRecordPacket
from .ExecuteCommand import ExecuteCommand

if TYPE_CHECKING:
	from ..services.ControlPlane import ControlPlane


# Port of the C++ Commands::FinishRecord: ends the recording. Every action is
# already in the stored program (RecordCommand writes as it goes) — this only
# stops recording and playback, and resets the flow mode for the new program.
class FinishRecordCommand(ICommand):

	def __init__(self, control: "ControlPlane", execute: ExecuteCommand) -> None:
		self._control = control
		self._execute = execute

	async def execute(self, packet: FinishRecordPacket, transport: "ITransport | None") -> None:

		self._control.isRecording = False
		self._control.isPlaying = False
		self._execute.resetFlow()

		respond(transport, packet.frame_id, CommandId.FINISH_RECORD, OutputId.SUCCESS)
