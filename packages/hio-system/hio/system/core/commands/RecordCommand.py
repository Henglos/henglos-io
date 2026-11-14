from henglosio.sdk.core import registry
from ..compat import TYPE_CHECKING
from ..interfaces.ICommand import ICommand
from ..interfaces.IConfig import IConfig
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, OutputId
from ..services.ProgramStorage import ProgramStorage
from ..packets.ExecutePacket import ExecutePacket
from ..packets.RecordPacket import RecordPacket
from .ExecuteCommand import BUILTIN_ACTION_IDS

if TYPE_CHECKING:
	from ..services.ControlPlane import ControlPlane


# Port of the C++ Commands::Record: appends one action to the stored program,
# as the EXECUTE frame that replays it. Runs for RECORD and, while recording,
# for EXECUTE too (see ControlPlane).
#
# Goes straight into the program: the first RECORD erases the previous one,
# and stops playback — it would otherwise replay a program still being
# written.
class RecordCommand(ICommand):

	def __init__(self, control: "ControlPlane", config: IConfig, programStorage: ProgramStorage) -> None:
		self._control = control
		self._config = config
		self._programStorage = programStorage

	async def execute(self, packet: "RecordPacket | ExecutePacket", transport: "ITransport | None") -> None:

		control = self._control
		storage = self._programStorage

		if not control.isRecording:
			control.isRecording = True
			control.isPlaying = False
			storage.clear()

		# An action this board doesn't have would only show up at playback,
		# as a program that silently stops there (ACTION_NOT_FOUND breaks the
		# chain of instances) — refused now instead, while the host is
		# listening. Typically: components added to the workflow after the
		# last flash.
		if packet.action_id not in BUILTIN_ACTION_IDS and registry.find(packet.action_id) is None:
			respond(transport, packet.frame_id, CommandId.RECORD, OutputId.ACTION_NOT_FOUND)
			return

		output_id = OutputId.SUCCESS
		frame = self._archive(packet)

		if frame is None or storage.size() + len(frame) > self._config.MAX_RECORD_SIZE or not storage.write(frame):
			output_id = OutputId.FALLBACK

		respond(transport, packet.frame_id, CommandId.RECORD, output_id)

	@staticmethod
	def _archive(packet: "RecordPacket | ExecutePacket") -> "bytes | None":
		# The EXECUTE frame that replays `packet` (a RecordPacket, or an
		# ExecutePacket received while recording). A STREAM config can't be
		# replayed — its data was never in the packet — so neither can it.
		if packet.streams:
			return None

		execute = ExecutePacket(packet.frame_id)
		execute.action_id = packet.action_id
		execute.instance_id = packet.instance_id
		execute.outputs = packet.outputs
		execute.binds = packet.binds
		execute.variables = packet.variables
		execute.codes = packet.codes
		execute.configs = packet.configs
		return execute.encode()
