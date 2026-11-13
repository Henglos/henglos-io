from .CommandIngress import CommandIngress, TransportChannel
from .PacketCodec import PacketCodec, Frame, HEADER_SIZE, MAX_PACKET_SIZE

# Largest frame that can exist on the wire: STX + LEN(16) + packet + ETX.
MAX_WIRE_FRAME_SIZE = HEADER_SIZE + MAX_PACKET_SIZE + 1


class FrameLease:
	# The bytes of one frame still sitting at the front of its channel. Whoever
	# is done with the frame first releases it — HIOSystem once the dispatch
	# returns, or a command earlier, once it copied out what it needs (an
	# EXECUTE whose action reads streams must free the channel for them).
	# Releasing twice is a no-op, so the later one never drops a frame that
	# came after.

	def __init__(self, ingress: CommandIngress, channel: TransportChannel, frame: Frame) -> None:
		self._ingress = ingress
		self._channel = channel
		self._size = frame.end + 1

	def release(self) -> None:
		if self._size:
			self._ingress.release(self._channel, self._size)
			self._size = 0


class FrameReader:
	# Finds frames in the bytes CommandIngress buffered — the one place that
	# knows both, shared by the main loop (HIOSystem) and by an action reading
	# a stream (BatchStream), which takes over the channel while it reads.

	def __init__(self, ingress: CommandIngress) -> None:
		self.ingress = ingress

	def poll(self, channel: TransportChannel) -> "Frame | None":
		# The first complete frame at the front of `channel`, not consumed —
		# see lease()/consume(). None when there's none yet; whatever can
		# never become one is dropped on the way.

		data = self.ingress.data(channel)
		frame = PacketCodec.resolve(data)

		if frame is None:
			# A frame starting more than MAX_WIRE_FRAME_SIZE - 1 bytes before
			# the end would already be complete, so whatever sits there is
			# noise (e.g. the ESP32 boot log) — keep only the tail that could
			# still be the beginning of a frame.
			stale = len(data) - (MAX_WIRE_FRAME_SIZE - 1)
			if stale > 0:
				self.ingress.release(channel, stale)

		return frame

	def lease(self, channel: TransportChannel, frame: Frame) -> FrameLease:
		return FrameLease(self.ingress, channel, frame)

	def consume(self, channel: TransportChannel, frame: Frame) -> None:
		# Drops `frame` and any noise before it — `frame` must come from the
		# last poll() of this channel.
		self.ingress.release(channel, frame.end + 1)
