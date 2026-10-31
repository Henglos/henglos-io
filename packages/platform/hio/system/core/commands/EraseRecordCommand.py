from ..compat import TYPE_CHECKING
from ..interfaces.ICommand import ICommand
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, OutputId
from ..services.ProgramStorage import ProgramStorage
from ..packets.EraseRecordPacket import EraseRecordPacket

if TYPE_CHECKING:
	from ..services.ControlPlane import ControlPlane


# Port of the C++ Commands::EraseRecord: drops the stored program — and with
# it any recording in progress — and stops playback.
class EraseRecordCommand(ICommand):

	def __init__(self, control: "ControlPlane", programStorage: ProgramStorage) -> None:
		self._control = control
		self._programStorage = programStorage

	async def execute(self, packet: EraseRecordPacket, transport: "ITransport | None") -> None:

		self._control.isRecording = False
		self._control.isPlaying = False
		self._programStorage.clear()

		respond(transport, packet.frame_id, CommandId.ERASE_RECORD, OutputId.SUCCESS)
