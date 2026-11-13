from ...core.interfaces.ITransport import ITransport, TransportType


class MemoryTransport(ITransport):
	# A link held in memory, for testing on the board without a UART: the
	# "host" side is static — MemoryTransport.send() feeds bytes in,
	# MemoryTransport.take() collects what the firmware answered — and acts
	# on the last instance created, so a script or the REPL can drive the one
	# main.py (or the script itself) handed to HIOSystem.
	#
	# Bytes only: building and decoding frames is PacketCodec's job.

	_current: "MemoryTransport | None" = None

	def __init__(self, size: int = 1024) -> None:
		# Host -> firmware, a fixed buffer: valid bytes live in rx[begin:end].
		self._rx = bytearray(size)
		self._rxView = memoryview(self._rx)
		self._begin = 0
		self._end = 0

		# Firmware -> host, until take() collects it.
		self._tx = bytearray()

		MemoryTransport._current = self

	# --- ITransport (firmware side)

	def type(self) -> int:
		return TransportType.MEMORY

	def begin(self) -> None:
		pass

	def end(self) -> None:
		pass

	def write(self, data) -> int:
		self._tx.extend(data)
		return len(data)

	def readinto(self, buffer) -> int:
		count = min(len(buffer), self._end - self._begin)
		if count <= 0:
			return 0

		buffer[:count] = self._rxView[self._begin:self._begin + count]
		self._begin += count

		if self._begin == self._end:
			self._begin = 0
			self._end = 0

		return count

	def available(self) -> int:
		return self._end - self._begin

	# --- host side

	@staticmethod
	def send(data) -> int:
		# Feeds `data` to the firmware, as if it came over the wire. Returns
		# how much fit — the rest is dropped, like an overflowing UART FIFO.
		transport = MemoryTransport._instance()

		if transport._end + len(data) > len(transport._rx) and transport._begin > 0:
			# Pending bytes to the front, to make room at the tail.
			pending = transport._end - transport._begin
			transport._rx[0:pending] = bytes(transport._rxView[transport._begin:transport._end])
			transport._begin = 0
			transport._end = pending

		count = min(len(data), len(transport._rx) - transport._end)
		transport._rxView[transport._end:transport._end + count] = data[:count]
		transport._end += count
		return count

	@staticmethod
	def pending() -> int:
		# Bytes sent but not read by the firmware yet.
		return MemoryTransport._instance().available()

	@staticmethod
	def take() -> bytes:
		# Everything the firmware wrote since the last take().
		transport = MemoryTransport._instance()
		data = bytes(transport._tx)
		transport._tx = bytearray()
		return data

	@staticmethod
	def _instance() -> "MemoryTransport":
		if MemoryTransport._current is None:
			raise RuntimeError("no MemoryTransport created yet")
		return MemoryTransport._current
