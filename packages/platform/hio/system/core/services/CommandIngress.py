from ..interfaces.ITransport import ITransport
from ..interfaces.IConfig import IConfig


class TransportChannel:
	# Plain data: one transport and its own receive buffer. Frames from
	# different transports must never share a buffer or they interleave and
	# corrupt each other. Valid bytes live in buffer[start:filled] — only
	# CommandIngress moves start/filled.

	def __init__(self, transport: ITransport, size: int) -> None:
		self.transport = transport
		self.buffer = bytearray(size)
		self.view = memoryview(self.buffer)
		self.begin = 0
		self.end = 0


class CommandIngress:
	# Buffers raw bytes off each transport — protocol-blind on purpose, it
	# never imports PacketCodec or knows what a frame is. Finding frames in
	# the bytes and deciding what to drop is HIOSystem's job; this class only
	# reads, hands out views and drops what it's told to.
	#
	# Consuming only advances `start`; bytes are moved back to the front only
	# when the tail runs out of room (see _compact), so the common case —
	# every received byte was part of a complete frame — never copies.

	def __init__(self, transports: list[ITransport], config: IConfig) -> None:
		self.transports = transports
		self.config = config
		self.channels = [TransportChannel(transport, config.MAX_FRAME_SIZE) for transport in transports]

	def update(self) -> None:

		for channel in self.channels:

			available = channel.transport.available()
			if available <= 0: continue    # -1: transport not open

			# Not enough room at the tail for what's waiting: move the pending
			# bytes to the front first.
			freeSpace = len(channel.buffer) - channel.end
			if freeSpace < available and channel.begin > 0:
				self._compact(channel)
				freeSpace = len(channel.buffer) - channel.end
			if freeSpace == 0: continue

			# view, not buffer: slicing the bytearray would read into a copy.
			# What doesn't fit stays in the transport for the next update().
			count = channel.transport.readinto(channel.view[channel.end:channel.end + min(available, freeSpace)])
			if count > 0: channel.end += count


	def data(self, channel: TransportChannel) -> memoryview:
		return channel.view[channel.begin:channel.end]

	def hasData(self, channel: TransportChannel) -> bool:
		return channel.end > channel.begin

	def release(self, channel: TransportChannel, count: int) -> None:
		channel.begin += count
		if channel.begin >= channel.end:
			channel.begin = 0
			channel.end = 0

	def _compact(self, channel: TransportChannel) -> None:

		if channel.begin == 0: return

		pending = channel.end - channel.begin

		channel.buffer[0:pending] = bytes(channel.view[channel.begin:channel.end])

		channel.begin = 0
		channel.end = pending
