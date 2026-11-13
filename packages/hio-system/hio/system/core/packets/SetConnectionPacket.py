from ..interfaces.IPacket import IPacket
from ..services.PacketCodec import CommandId


# REQUEST SET_CONNECTION — persist the control-link UART config. Body:
#   TARGET(8) + BAUD(32) + TX_PIN(8) + RX_PIN(8) + DATA_BITS(8) + PARITY(8)
#   + STOP_BITS(8) + [FLAGS(8)]
# A pin of 0xFF, or DATA_BITS/PARITY/STOP_BITS of 0, means "keep current".
# FLAGS bit0 = reboot after persisting; a missing FLAGS byte counts as 0.
class SetConnectionPacket(IPacket):

	COMMAND_ID = CommandId.SET_CONNECTION

	def __init__(self, frame_id: int) -> None:
		self.frame_id = frame_id
		self.target = 0
		self.baud = 0
		self.tx_pin = -1            # -1 = keep current
		self.rx_pin = -1            # -1 = keep current
		self.data_bits = 0          # 0 = keep current
		self.parity = 0             # ord("N"/"E"/"O"), 0 = keep current
		self.stop_bits = 0          # 0 = keep current
		self.reboot = False

	@staticmethod
	def decode(frame_id: int, body: memoryview) -> "SetConnectionPacket | None":

		if len(body) < 10:
			return None

		packet = SetConnectionPacket(frame_id)
		packet.target = body[0]
		packet.baud = body[1] | (body[2] << 8) | (body[3] << 16) | (body[4] << 24)
		packet.tx_pin = -1 if body[5] == 0xFF else body[5]
		packet.rx_pin = -1 if body[6] == 0xFF else body[6]
		packet.data_bits = body[7]
		packet.parity = body[8]
		packet.stop_bits = body[9]
		packet.reboot = len(body) > 10 and (body[10] & 0x01) != 0

		return packet
