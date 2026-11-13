from machine import UART
from ...core.interfaces.ITransport import ITransport, TransportType

class SerialTransport(ITransport):
	# The control link over a UART — the board's USB serial — with a 1 KB
	# receive buffer. Every method answers -1 before begin().

	def __init__(self, uart_id: int, baudrate: int, tx: int = -1, rx: int =-1) -> None:
		self._uart_id = uart_id
		self._baudrate = baudrate
		self._tx = tx
		self._rx = rx
		self._uart = None

	def type(self) -> int:
		return TransportType.SERIAL

	def begin(self) -> None:
		if self._tx >= 0 and self._rx >= 0:
			self._uart = UART(self._uart_id, self._baudrate, rxbuf=1024, tx=self._tx, rx=self._rx)
		else:
			self._uart = UART(self._uart_id, self._baudrate, rxbuf=1024)

	def end(self) -> None:
		if self._uart:
			self._uart.deinit()
			self._uart = None

	def write(self, data) -> int:
		if self._uart is None: return -1
		return self._uart.write(data) or 0

	def readinto(self, buffer) -> int:
		if self._uart is None: return -1
		return self._uart.readinto(buffer) or 0

	def available(self) -> int:
		if self._uart is None: return -1
		return self._uart.any()