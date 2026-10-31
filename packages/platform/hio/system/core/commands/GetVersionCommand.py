from ..interfaces.ICommand import ICommand
from ..interfaces.IConfig import IConfig
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, OutputId, Config, DataType
from ..packets.GetVersionPacket import GetVersionPacket

_VERSION_CONFIG_ID = 0x0001


# Port of the C++ Commands::GetVersion: answers with the firmware version as
# one config entry (id 0x0001).
class GetVersionCommand(ICommand):

	def __init__(self, config: IConfig) -> None:
		self._config = config

	async def execute(self, packet: GetVersionPacket, transport: "ITransport | None") -> None:

		version = Config(_VERSION_CONFIG_ID, DataType.UINT_8, self._config.VERSION.encode(), True)

		respond(transport, packet.frame_id, CommandId.GET_VERSION, OutputId.SUCCESS, (version,))
