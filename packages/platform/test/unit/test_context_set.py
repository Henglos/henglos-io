# CONTEXT_SET (COMMAND_ID 0x0D): the studio's debugger overwriting what an
# action published, before the next action reads it through a bind.

import asyncio
import struct

from support import Host, request_frame

from hio.sdk import HIOAction, action
from hio.sdk.core.identifier import generate_id
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.services.PacketCodec import BindLink, CommandId, DataType, OutputId


@action("x/produce")
class _Produce(HIOAction):
	async def execute(self, context):
		context.set("reading", 10)
		return None


@action("x/consume")
class _Consume(HIOAction):
	async def execute(self, context):
		context.set("seen", context.get("consume/input"))
		return None


def _execute(frame_id: int, name: str, binds=()) -> bytes:
	packet = ExecutePacket(frame_id)
	packet.action_id = generate_id(name)
	packet.binds = list(binds)
	return packet.encode()


def _context_set(frame_id: int, *entries: bytes) -> bytes:
	return request_frame(frame_id, CommandId.CONTEXT_SET, b"".join(entries))


def _int32(name: str, value: int) -> bytes:
	return struct.pack("<HB", generate_id(name), DataType.INT_32) + struct.pack("<i", value)


def _text(name: str, value: str) -> bytes:
	data = value.encode()
	return struct.pack("<HBH", generate_id(name), DataType.UINT_8 | DataType.ARRAY_BIT, len(data)) + data


def test_context_set_changes_what_the_next_bind_reads():
	async def go():
		async with Host() as host:
			host.send(_execute(1, "x/produce"))
			assert struct.unpack("<i", (await host.response(1)).configs[generate_id("reading")])[0] == 10

			host.send(_context_set(2, _int32("reading", 99)))
			answer = await host.response(2)
			assert (answer.command_id, answer.id) == (CommandId.CONTEXT_SET, OutputId.SUCCESS)

			host.send(_execute(3, "x/consume", [BindLink(generate_id("consume/input"), generate_id("reading"))]))
			assert struct.unpack("<i", (await host.response(3)).configs[generate_id("seen")])[0] == 99

	asyncio.run(go())


def test_context_set_takes_arrays_and_ignores_a_malformed_body():
	async def go():
		async with Host() as host:
			host.send(_context_set(1, _text("label", "hello")))
			assert (await host.response(1)).id == OutputId.SUCCESS

			host.send(_execute(2, "x/consume", [BindLink(generate_id("consume/input"), generate_id("label"))]))
			assert (await host.response(2)).configs[generate_id("seen")] == b"hello"

			# A truncated entry decodes to nothing: no answer, nothing written —
			# the bind on "reading" then finds nothing (and the last input
			# wasn't handed on: no Pass Context), so there's nothing to see.
			host.send(_context_set(3, _int32("reading", 1)[:-2]))
			host.send(_execute(4, "x/consume", [BindLink(generate_id("consume/input"), generate_id("reading"))]))
			answer = await host.response(4)
			assert generate_id("seen") not in answer.configs

	asyncio.run(go())
