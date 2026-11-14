from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id
from ..interfaces.ICommand import ICommand
from ..interfaces.IConfig import IConfig
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, OutputId
from ..packets.RemoveComponentPacket import RemoveComponentPacket
from ..services.ComponentLoader import ComponentLoader
from .ExecuteCommand import ExecuteCommand
from .files import remove_file


# Port of the C++ Commands::RemoveComponent: drops one stored component —
# its file and its registered action. Idempotent: a component that's already
# gone still counts as removed; only a name too long to be one fails.
class RemoveComponentCommand(ICommand):

	def __init__(self, config: IConfig, execute: ExecuteCommand) -> None:
		self._config = config
		self._execute = execute
		self._components = ComponentLoader(config.COMPONENTS_DIR)

	async def execute(self, packet: RemoveComponentPacket, transport: "ITransport | None") -> None:

		config = self._config
		output_id = OutputId.FALLBACK

		if len(packet.name) <= config.MAX_COMPONENT_NAME:

			# "<component>/<action>" -> <COMPONENTS_DIR>/<component>/<action>.mpy
			remove_file(self._components.path(packet.name))

			action_id = generate_id(packet.name)
			registry.unregister(action_id)
			self._execute.forget(action_id)

			output_id = OutputId.SUCCESS

		respond(transport, packet.frame_id, CommandId.REMOVE_COMPONENT, output_id)
