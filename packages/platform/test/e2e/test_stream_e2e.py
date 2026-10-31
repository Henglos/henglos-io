# The whole runtime (HIOSystem.run) against a simulated host on an in-memory
# serial link: the host speaks only bytes — frames in, responses out — the
# same exchange the driver has with a real board.

import asyncio
import struct

from support import Host, execute_frame, stream_frame, request_frame

from hio.sdk import HIOAction, action, SUCCESS, generate_id
from hio.system.core.services.PacketCodec import CommandId, OutputId, StreamStatus


# --- actions under test

@action("e2e/sum")
class SumAction(HIOAction):
	# Reads every chunk, publishes how many bytes and their sum.
	async def execute(self, context):
		total = 0
		count = 0
		async for chunk in self.batch("data"):
			total += sum(chunk)
			count += len(chunk)
		context.set("count", count)
		context.set("sum", total)
		return SUCCESS


@action("e2e/first")
class FirstChunkAction(HIOAction):
	# Stops after the first chunk, leaving the rest unread.
	async def execute(self, context):
		async for chunk in self.batch("data"):
			context.set("first", bytes(chunk))
			break
		return SUCCESS


@action("e2e/text")
class TextAction(HIOAction):
	# The whole value at once.
	async def execute(self, context):
		context.set("text", bytes(await self.batch("data").read()))
		return SUCCESS


@action("e2e/plain")
class PlainAction(HIOAction):
	# No stream at all.
	async def execute(self, context):
		context.set("ran", True)
		return SUCCESS


def _int(data: bytes) -> int:
	return struct.unpack("<i", data)[0]


def run(scenario):
	asyncio.run(scenario())


# --- scenarios

def test_full_stream_in_chunks():
	data = bytes(i % 251 for i in range(600))

	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x0100, "e2e/sum", streams=[("data", len(data))]))
			await host.stream(0x0100, "data", data, chunk_size=200, first_id=0x0200)

			done = await host.response(0x0100)
			assert (done.command_id, done.id) == (CommandId.EXECUTE, OutputId.SUCCESS)
			assert _int(done.configs[generate_id("count")]) == 600
			assert _int(done.configs[generate_id("sum")]) == sum(data)
			assert host.leftovers() == []

	run(scenario)


def test_largest_chunk_that_fits_one_frame():
	# MAX_PAYLOAD_SIZE(251) - COMMAND_ID(1) - STREAM_REF(2) - CONFIG_ID(2).
	data = bytes(range(246))

	async def scenario():
		async with Host() as host:
			host.send(execute_frame(1, "e2e/sum", streams=[("data", len(data))]))
			await host.stream(1, "data", data, chunk_size=246, first_id=2)
			done = await host.response(1)
			assert _int(done.configs[generate_id("sum")]) == sum(data)

	run(scenario)


def test_other_commands_wait_while_streaming():
	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "e2e/sum", streams=[("data", 4)]))
			await host.stream(0x10, "data", b"ab", chunk_size=2, first_id=0x20)

			# Mid-stream: nothing else runs, the host is told what's expected.
			host.send(request_frame(0x30, CommandId.GET_VERSION))
			waiting = await host.response(0x30)
			assert (waiting.command_id, waiting.id) == (CommandId.STREAM, StreamStatus.WAITING)
			assert waiting.configs == {generate_id("data"): b"\x10\x00"}

			host.send(execute_frame(0x31, "e2e/plain"))
			assert (await host.response(0x31)).id == StreamStatus.WAITING

			await host.stream(0x10, "data", b"cd", chunk_size=2, first_id=0x21)
			assert (await host.response(0x10)).id == OutputId.SUCCESS

			# Stream over: the board takes commands again.
			host.send(request_frame(0x32, CommandId.GET_VERSION))
			version = await host.response(0x32)
			assert version.command_id == CommandId.GET_VERSION
			assert version.configs[0x0001] == b"test"

	run(scenario)


def test_chunk_for_the_wrong_config_is_redirected():
	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "e2e/sum", streams=[("data", 2)]))

			host.send(stream_frame(0x20, 0x10, "nope", b"zz"))
			waiting = await host.response(0x20)
			assert waiting.id == StreamStatus.WAITING
			assert waiting.configs == {generate_id("data"): b"\x10\x00"}

			await host.stream(0x10, "data", b"ok", chunk_size=2, first_id=0x21)
			done = await host.response(0x10)
			assert _int(done.configs[generate_id("sum")]) == sum(b"ok")

	run(scenario)


def test_action_that_stops_early():
	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "e2e/first", streams=[("data", 6)]))
			await host.stream(0x10, "data", b"ab", chunk_size=2, first_id=0x20)

			done = await host.response(0x10)
			assert done.configs[generate_id("first")] == b"ab"

			# The action is gone: a late chunk is refused, never run.
			host.send(stream_frame(0x21, 0x10, "data", b"cd"))
			late = await host.response(0x21)
			assert (late.command_id, late.id) == (CommandId.STREAM, StreamStatus.NOT_FOUND)

	run(scenario)


def test_chunk_without_any_stream_is_not_found():
	async def scenario():
		async with Host() as host:
			host.send(stream_frame(0x50, 0x40, "data", b"xx"))
			stray = await host.response(0x50)
			assert (stray.command_id, stray.id) == (CommandId.STREAM, StreamStatus.NOT_FOUND)

	run(scenario)


def test_open_ended_stream_with_read():
	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "e2e/text", streams=[("data", 0)]))
			await host.stream(0x10, "data", b"hello world", chunk_size=4, first_id=0x20)

			host.send(stream_frame(0x2F, 0x10, "data", b""))              # end
			assert (await host.response(0x2F)).id == StreamStatus.OK

			done = await host.response(0x10)
			assert done.configs[generate_id("text")] == b"hello world"

	run(scenario)


def test_host_silence_times_out():
	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "e2e/sum", streams=[("data", 4)]))

			timeout = await host.response(0x10)            # TIMEOUT answers on the STREAM_REF
			assert (timeout.command_id, timeout.id) == (CommandId.STREAM, StreamStatus.TIMEOUT)

			done = await host.response(0x10)
			assert (done.command_id, done.id) == (CommandId.EXECUTE, OutputId.FALLBACK)

			# And the board is free again.
			host.send(execute_frame(0x11, "e2e/plain"))
			assert (await host.response(0x11)).id == OutputId.SUCCESS

	run(scenario)


def test_pipelined_chunks_are_read_in_order():
	# A host that doesn't wait for each OK still can't overrun the board: what
	# doesn't fit the channel buffer waits in the link.
	data = bytes(range(200)) * 3

	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "e2e/sum", streams=[("data", len(data))]))
			for i in range(6):
				host.send(stream_frame(0x20 + i, 0x10, "data", data[i * 100:(i + 1) * 100]))

			done = await host.response(0x10)
			assert _int(done.configs[generate_id("sum")]) == sum(data)
			for i in range(6):
				assert (await host.response(0x20 + i)).id == StreamStatus.OK

	run(scenario)


def test_execute_without_streams_is_unchanged():
	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "e2e/plain"))
			done = await host.response(0x10)
			assert (done.command_id, done.id) == (CommandId.EXECUTE, OutputId.SUCCESS)
			assert done.configs[generate_id("ran")] == b"\x01"

	run(scenario)
