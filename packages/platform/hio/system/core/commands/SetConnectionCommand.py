import asyncio
import json

from ..interfaces.ICommand import ICommand
from ..interfaces.IConfig import IConfig
from ..interfaces.ITransport import ITransport
from ..output import respond
from ..services.PacketCodec import CommandId, OutputId, Config, DataType
from ..packets.SetConnectionPacket import SetConnectionPacket

_ECHO_CONFIG_ID = 0x0001
_TARGET_CONTROL_LINK = 0


# Persists the control-link UART config to CONNECTION_PATH, for boot to apply.
# The C++ firmware only has the older SetBaudrate (which just answered); this
# follows what the host expects from SET_CONNECTION (shared's packet.ts:
# buildSetConnectionPayload / parseSetConnectionResponse):
#   - a field left at "keep" (pin -1, data bits/parity/stop bits 0) keeps
#     the stored value,
#   - on success the response carries one config entry echoing the result:
#     BAUD(32) + TX(8) + RX(8) + DATA_BITS(8) + PARITY(8) + STOP_BITS(8),
#     a pin of 0xFF meaning the port's default pin,
#   - `reboot` resets the board once the response is out.
class SetConnectionCommand(ICommand):

	def __init__(self, config: IConfig) -> None:
		self._config = config

	async def execute(self, packet: SetConnectionPacket, transport: "ITransport | None") -> None:

		if packet.target != _TARGET_CONTROL_LINK:
			respond(transport, packet.frame_id, CommandId.SET_CONNECTION, OutputId.FALLBACK)
			return

		connection = self._load()

		if packet.baud:
			connection["baud"] = packet.baud
		if packet.tx_pin >= 0:
			connection["tx"] = packet.tx_pin
		if packet.rx_pin >= 0:
			connection["rx"] = packet.rx_pin
		if packet.data_bits:
			connection["data_bits"] = packet.data_bits
		if packet.parity:
			connection["parity"] = packet.parity
		if packet.stop_bits:
			connection["stop_bits"] = packet.stop_bits

		try:
			with open(self._config.CONNECTION_PATH, "w") as file:
				json.dump(connection, file)
		except OSError:
			respond(transport, packet.frame_id, CommandId.SET_CONNECTION, OutputId.FALLBACK)
			return

		respond(transport, packet.frame_id, CommandId.SET_CONNECTION, OutputId.SUCCESS, (self._echo(connection),))

		if packet.reboot:
			await asyncio.sleep(0.1)    # let the response drain out of the UART first
			import machine
			machine.reset()

	def _load(self) -> dict:
		connection = {
			"baud": self._config.DEFAULT_BAUDRATE,
			"tx": -1,
			"rx": -1,
			"data_bits": 8,
			"parity": ord("N"),
			"stop_bits": 1,
		}
		try:
			with open(self._config.CONNECTION_PATH) as file:
				connection.update(json.load(file))
		except (OSError, ValueError):
			pass
		return connection

	@staticmethod
	def _echo(connection: dict) -> Config:
		baud = connection["baud"]
		data = bytes((
			baud & 0xFF, (baud >> 8) & 0xFF, (baud >> 16) & 0xFF, (baud >> 24) & 0xFF,
			0xFF if connection["tx"] < 0 else connection["tx"],
			0xFF if connection["rx"] < 0 else connection["rx"],
			connection["data_bits"],
			connection["parity"],
			connection["stop_bits"],
		))
		return Config(_ECHO_CONFIG_ID, DataType.UINT_8, data, True)
