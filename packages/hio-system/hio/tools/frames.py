# Talks to the runtime from the board itself — the REPL or `mpremote run` —
# over a MemoryTransport, no UART needed:
#
#   from hio.tools.frames import start, exchange, get_version
#   system = start()
#   exchange(system, get_version())
#   -> [('RESPONSE', 1, 7, 0, {1: b'1.0.0'})]

import asyncio

from ..system.HIOSystem import HIOSystem
from ..system.SystemConfig import SystemConfig
from ..system.infrastructure.transports.MemoryTransport import MemoryTransport
from ..system.core.services.PacketCodec import PacketCodec, FrameType, CommandId, u16


def start() -> HIOSystem:
	# A runtime on a MemoryTransport — its own, apart from whatever main.py
	# started (mpremote stops that one before running a script).
	system = HIOSystem([MemoryTransport()], SystemConfig())
	system.initialize()
	return system


# --- frames the host sends

def request(frame_id: int, command_id: int, body: bytes = b"") -> bytes:
	return PacketCodec.build_frame(FrameType.REQUEST, frame_id, bytes((command_id,)) + body)


def get_version(frame_id: int = 1) -> bytes:
	# A GET_VERSION request — what the runtime answers its VERSION to.
	return request(frame_id, CommandId.GET_VERSION)


# --- running them

def exchange(system: HIOSystem, *frames: bytes) -> list:
	# Sends `frames`, runs the main task until it took them all in and returns
	# what the firmware answered, decoded.
	feed(system, b"".join(frames))
	return decode(MemoryTransport.take())


def feed(system: HIOSystem, data: bytes, rounds: int = 1000) -> None:
	# Hands `data` to the runtime and runs its main task until every byte was
	# read and every complete frame dispatched. Not until update() goes idle:
	# a playing program keeps it busy forever. `rounds` caps it anyway — a
	# frame cut short never completes.
	task = system.mainTask
	ingress = task.commandIngress
	offset = 0

	async def pump() -> None:
		nonlocal offset
		for _ in range(rounds):
			# As much as the transport takes at a time: a burst bigger than
			# its buffer still gets through.
			offset += MemoryTransport.send(data[offset:])
			await task.update()
			if offset >= len(data) and not MemoryTransport.pending() and not any(ingress.hasData(c) for c in ingress.channels):
				return

	asyncio.run(pump())


def decode(data: bytes) -> list:
	# Every frame in `data`, as tuples:
	#   ('RESPONSE', frame_id, command_id, id, {config_id: bytes})
	#   ('DEBUG', frame_id, level, message)
	# Anything else as ('FRAME', frame_type, frame_id, payload).
	replies = []

	while True:
		frame = PacketCodec.resolve(data)
		if frame is None:
			return replies

		payload = bytes(frame.payload)

		if frame.frame_type == FrameType.RESPONSE:
			configs = {}
			index = 3
			while index + 4 <= len(payload):
				size = u16(payload, index + 2)
				configs[u16(payload, index)] = payload[index + 4:index + 4 + size]
				index += 4 + size
			replies.append(("RESPONSE", frame.frame_id, payload[0], u16(payload, 1), configs))

		elif frame.frame_type == FrameType.DEBUG:
			replies.append(("DEBUG", frame.frame_id, payload[0], payload[1:].decode()))

		else:
			replies.append(("FRAME", frame.frame_type, frame.frame_id, payload))

		data = data[frame.end + 1:]
