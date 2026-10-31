# Shared test doubles: an in-memory transport, a config sized for tests, and
# helpers to build host frames and read the firmware's responses.

import asyncio

from hio.system.core.interfaces.ITransport import ITransport, TransportType
from hio.system.core.interfaces.IConfig import IConfig
from hio.system.core.services.PacketCodec import (
	PacketCodec, FrameType, CommandId, StreamStatus, StreamLink, Config, DataType,
	MIN_FRAME_SIZE, u16,
)
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.packets.StreamPacket import StreamPacket
from hio.sdk import HIOAction, action
from hio.sdk.core.identifier import generate_id
from hio.system.HIOSystem import HIOSystem


# Installed actions the tests record and run by name: RECORD refuses an action
# the board doesn't have.
@action("x/a")
class _ActionA(HIOAction):
	async def execute(self, context):
		return None


@action("x/b")
class _ActionB(HIOAction):
	async def execute(self, context):
		return None


class StubConfig(IConfig):

	VERSION = "test"

	MAX_FRAME_SIZE = MIN_FRAME_SIZE + 1024      # SystemConfig's receive buffer — holds a whole frame
	DEFAULT_BAUDRATE = 115200
	STREAM_TIMEOUT_MS = 200

	MAX_CONTEXT_ENTRIES = 16
	MAX_VARIABLES = 16
	MAX_SCRIPT_CACHE = 8

	PROGRAM_PATH = "/program.bin"
	MAX_RECORD_SIZE = 4096

	COMPONENTS_DIR = "/components"
	MAX_COMPONENT_NAME = 32

	CONNECTION_PATH = "/connection.json"


class LoopbackTransport(ITransport):
	# A live link held in memory: the test feeds `rx` (host -> firmware) and
	# reads `tx` (firmware -> host).

	def __init__(self, kind: int = TransportType.SERIAL) -> None:
		self._kind = kind
		self.rx = bytearray()
		self.tx = bytearray()

	def type(self) -> int:
		return self._kind

	def begin(self) -> None:
		pass

	def end(self) -> None:
		pass

	def write(self, data) -> int:
		self.tx.extend(data)
		return len(data)

	def readinto(self, buffer) -> int:
		count = min(len(buffer), len(self.rx))
		buffer[:count] = self.rx[:count]
		del self.rx[:count]
		return count

	def available(self) -> int:
		return len(self.rx)

	def send(self, frame: bytes) -> None:
		self.rx.extend(frame)


class Response:
	# A RESPONSE frame the firmware wrote, decoded the way the host would.

	def __init__(self, frame_id: int, command_id: int, id: int, configs: "dict[int, bytes]") -> None:
		self.frame_id = frame_id
		self.command_id = command_id
		self.id = id
		self.configs = configs

	def __repr__(self) -> str:
		return "Response(frame_id=0x%04x, command_id=0x%02x, id=0x%04x, configs=%r)" % (
			self.frame_id, self.command_id, self.id, self.configs)


def take_frames(transport: LoopbackTransport) -> list:
	# Every complete frame in `transport.tx`, removed from it.
	frames = []
	while True:
		# resolve() hands out views — scan a copy so tx can still shrink.
		frame = PacketCodec.resolve(bytes(transport.tx))
		if frame is None:
			return frames
		frames.append((frame.frame_type, frame.frame_id, bytes(frame.payload)))
		del transport.tx[:frame.end + 1]


def take_responses(transport: LoopbackTransport) -> "list[Response]":
	# Every RESPONSE in `transport.tx` (DEBUG frames are dropped), removed from it.
	responses = []
	for frame_type, frame_id, payload in take_frames(transport):
		if frame_type != FrameType.RESPONSE:
			continue
		configs = {}
		index = 3
		while index + 4 <= len(payload):
			size = u16(payload, index + 2)
			configs[u16(payload, index)] = payload[index + 4:index + 4 + size]
			index += 4 + size
		responses.append(Response(frame_id, payload[0], u16(payload, 1), configs))
	return responses


def execute_frame(frame_id: int, action: str, streams=(), configs=(), instance_id: int = 0) -> bytes:
	# EXECUTE of `action`. `streams`: (name, total_size) STREAM configs of
	# UINT_8 elements. `configs`: Config literals.
	packet = ExecutePacket(frame_id)
	packet.action_id = generate_id(action)
	packet.instance_id = instance_id
	packet.streams = [StreamLink(generate_id(name), DataType.UINT_8, total) for name, total in streams]
	packet.configs = list(configs)
	return packet.encode()


def stream_frame(frame_id: int, stream_ref: int, name: str, chunk: bytes) -> bytes:
	return StreamPacket(frame_id, stream_ref, generate_id(name), chunk).encode()


def request_frame(frame_id: int, command_id: int, body: bytes = b"") -> bytes:
	return PacketCodec.build_frame(FrameType.REQUEST, frame_id, bytes((command_id,)) + body)


async def wait_for(predicate, timeout: float = 2.0, step: float = 0.002):
	# Polls `predicate` until it returns something truthy — what it returned.
	deadline = asyncio.get_running_loop().time() + timeout
	while True:
		result = predicate()
		if result:
			return result
		if asyncio.get_running_loop().time() > deadline:
			raise AssertionError("timed out waiting for the firmware")
		await asyncio.sleep(step)


class Host:
	# The whole runtime (its MainTask) behind an in-memory serial link, and
	# the host side of it: frames in, responses out — the same exchange the
	# driver has with a real board. Use as `async with Host() as host:`.

	def __init__(self) -> None:
		self.link = LoopbackTransport()
		self.system = HIOSystem([self.link], StubConfig())
		self._inbox = []

	async def __aenter__(self) -> "Host":
		self.system.initialize()
		self._task = asyncio.create_task(self.system.mainTask.run())
		return self

	async def __aexit__(self, *exc) -> None:
		self._task.cancel()
		try:
			await self._task
		except asyncio.CancelledError:
			pass

	def send(self, frame: bytes) -> None:
		self.link.send(frame)

	async def response(self, frame_id: int):
		# The next response to `frame_id`.
		def find():
			self._inbox.extend(take_responses(self.link))
			for response in self._inbox:
				if response.frame_id == frame_id:
					self._inbox.remove(response)
					return response
		return await wait_for(find)

	async def stream(self, stream_ref: int, name: str, data: bytes, chunk_size: int, first_id: int) -> None:
		# Sends `data` the way the driver does: one chunk, wait for its OK, next.
		frame_id = first_id
		for offset in range(0, len(data), chunk_size):
			self.send(stream_frame(frame_id, stream_ref, name, data[offset:offset + chunk_size]))
			ack = await self.response(frame_id)
			assert (ack.command_id, ack.id) == (CommandId.STREAM, StreamStatus.OK), ack
			frame_id += 1

	def leftovers(self) -> list:
		self._inbox.extend(take_responses(self.link))
		return self._inbox
