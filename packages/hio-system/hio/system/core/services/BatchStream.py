from henglosio.sdk.core.stream import HIOStream, HIOStreamError
from ..compat import sleep_ms, ticks_ms, ticks_diff
from ..output import respond
from ..packets.StreamPacket import StreamPacket
from .CommandIngress import TransportChannel
from .FrameReader import FrameReader
from .PacketCodec import PacketCodec, Frame, FrameType, CommandId, StreamStatus, StreamLink, Config, DataType, element_size

# Pause between reads that found no frame, so a stream waiting on the host
# still lets the other tasks (the daemon) run instead of spinning.
_IDLE_MS = 1


class BatchStream(HIOStream):
	# One STREAM config of a running action, read straight off the channel its
	# EXECUTE came in on. The EXECUTE runs inline, so the main loop is parked
	# inside that dispatch: while the action waits for a chunk, this is the
	# only reader of every channel — see PacketCodec's STREAMS for what the
	# host sees.
	#
	# Zero-copy: a chunk is a view into the channel's buffer and its frame is
	# only consumed — and the host told OK — once the action asks for the
	# next chunk or ends. One chunk in flight at a time, so the host can never
	# send faster than the action consumes.

	def __init__(self, reader: FrameReader, channel: TransportChannel, stream_ref: int, link: StreamLink, timeout_ms: int) -> None:
		self.config_id = link.config_id
		self.data_type = link.data_type
		self.total_size = link.total_size
		self.received = 0

		self._reader = reader
		self._channel = channel
		self._transport = channel.transport
		self._stream_ref = stream_ref
		self._timeout_ms = timeout_ms
		self._element_size = element_size(link.data_type)

		self._pending = None                # frame of the chunk the action holds
		self._closed = False
		self._error = None

	# --- action side (HIOStream)

	async def __anext__(self) -> memoryview:

		self._release(StreamStatus.OK)

		if self._closed:
			if self._error is not None:
				raise self._error
			raise StopAsyncIteration

		if self.total_size and self.received == self.total_size:
			self._closed = True
			raise StopAsyncIteration

		started = ticks_ms()

		while True:

			self._reader.ingress.update()
			self._reject_others()

			frame = self._reader.poll(self._channel)
			if frame is not None:
				chunk = self._take(frame)
				if chunk is not None:
					return chunk
				continue

			if ticks_diff(ticks_ms(), started) >= self._timeout_ms:
				self._fail(self._stream_ref, StreamStatus.TIMEOUT, "timed out waiting for data")

			await sleep_ms(_IDLE_MS)

	# --- runtime side

	def close(self) -> None:
		# Called when the action ends: the chunk it still holds is done with,
		# and nothing more will be read — chunks still on their way get
		# NOT_FOUND from the main loop.
		self._release(StreamStatus.OK)
		self._closed = True

	# --- internals

	def _take(self, frame: Frame) -> "memoryview | None":
		# The chunk in `frame` if it's the next one of this stream; anything
		# else is consumed and rejected. Raises once the stream is over.

		packet = PacketCodec.decode(frame) if frame.frame_type == FrameType.REQUEST else None

		if (not isinstance(packet, StreamPacket)
				or packet.stream_ref != self._stream_ref
				or packet.config_id != self.config_id):
			if frame.frame_type == FrameType.REQUEST:
				self._waiting(self._transport, frame.frame_id)
			self._reader.consume(self._channel, frame)
			return None

		size = len(packet.chunk)

		if size == 0:
			self._reader.consume(self._channel, frame)
			if self.total_size:
				self._fail(frame.frame_id, StreamStatus.INVALID, "stream ended before TOTAL_SIZE")
			self._respond(frame.frame_id, StreamStatus.OK)
			self._closed = True
			raise StopAsyncIteration

		if size % self._element_size or (self.total_size and self.received + size > self.total_size):
			self._reader.consume(self._channel, frame)
			self._fail(frame.frame_id, StreamStatus.INVALID, "invalid chunk")

		self.received += size
		self._pending = frame
		return packet.chunk

	def _release(self, status: int) -> None:
		# The action is done with the chunk it held: answer it and free its bytes.
		frame = self._pending
		if frame is None:
			return

		self._pending = None
		self._respond(frame.frame_id, status)
		self._reader.consume(self._channel, frame)

	def _reject_others(self) -> None:
		# Every other channel gets WAITING for whatever it sends while this
		# stream is read. The stored program isn't a channel — MainTask, parked
		# in this dispatch, doesn't feed it in meanwhile.
		for channel in self._reader.ingress.channels:

			if channel is self._channel:
				continue

			while True:
				frame = self._reader.poll(channel)
				if frame is None:
					break
				if frame.frame_type == FrameType.REQUEST:
					self._waiting(channel.transport, frame.frame_id)
				self._reader.consume(channel, frame)

	def _waiting(self, transport, frame_id: int) -> None:
		ref = Config(self.config_id, DataType.BYTES, bytes((self._stream_ref & 0xFF, self._stream_ref >> 8)))
		respond(transport, frame_id, CommandId.STREAM, StreamStatus.WAITING, (ref,))

	def _respond(self, frame_id: int, status: int) -> None:
		respond(self._transport, frame_id, CommandId.STREAM, status)

	def _fail(self, frame_id: int, status: int, reason: str) -> None:
		self._respond(frame_id, status)
		self._closed = True
		self._error = HIOStreamError(reason)
		raise self._error
