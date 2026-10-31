from ..compat import TYPE_CHECKING
from ..interfaces.ICommand import ICommand
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, OutputId
from ..services.ProgramStorage import ProgramStorage
from ..packets.StandalonePacket import StandalonePacket

if TYPE_CHECKING:
	from ..services.ControlPlane import ControlPlane


# Port of the C++ Commands::Standalone: replays the stored program from the
# start. MainTask feeds its frames in while `isPlaying`.
class StandaloneCommand(ICommand):

	def __init__(self, control: "ControlPlane", programStorage: ProgramStorage) -> None:
		self._control = control
		self._programStorage = programStorage

	async def execute(self, packet: StandalonePacket, transport: "ITransport | None") -> None:

		self._programStorage.rewind()
		self._control.isPlaying = True

		respond(transport, packet.frame_id, CommandId.STANDALONE, OutputId.SUCCESS)
