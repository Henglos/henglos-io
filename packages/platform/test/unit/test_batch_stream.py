# BatchStream on its own: chunks preloaded into an in-memory transport.

import asyncio

import pytest

from support import LoopbackTransport, StubConfig, stream_frame, request_frame, take_responses

from hio.sdk.core.identifier import generate_id
from hio.sdk.core.stream import HIOStreamError
from hio.system.core.services.BatchStream import BatchStream
from hio.system.core.services.CommandIngress import CommandIngress
from hio.system.core.services.FrameReader import FrameReader
from hio.system.core.services.PacketCodec import CommandId, StreamStatus, StreamLink, DataType

REF = 0x0042
LEDS = generate_id("leds")
OTHER = generate_id("other")


class Rig:

	def __init__(self, total_size: int, data_type: int = DataType.UINT_8, timeout_ms: int = 100) -> None:
		self.host = LoopbackTransport()
		self.other = LoopbackTransport()
		self.ingress = CommandIngress([self.host, self.other], StubConfig())
		self.reader = FrameReader(self.ingress)
		self.stream = BatchStream(
			self.reader, self.ingress.channels[0], REF,
			StreamLink(LEDS, data_type, total_size), timeout_ms,
		)

	def send(self, *frames: bytes) -> None:
		for frame in frames:
			self.host.send(frame)

	def responses(self, transport=None):
		return [(r.frame_id, r.command_id, r.id) for r in take_responses(transport or self.host)]


def run(coroutine):
	return asyncio.run(coroutine)


async def _collect(stream) -> list:
	return [bytes(chunk) async for chunk in stream]


def test_reads_every_chunk_up_to_total_size():
	rig = Rig(total_size=5)
	rig.send(stream_frame(1, REF, "leds", b"abc"), stream_frame(2, REF, "leds", b"de"))

	assert run(_collect(rig.stream)) == [b"abc", b"de"]
	assert rig.stream.received == 5
	assert rig.responses() == [
		(1, CommandId.STREAM, StreamStatus.OK),
		(2, CommandId.STREAM, StreamStatus.OK),
	]


def test_ok_only_once_the_action_asks_for_the_next_chunk():
	rig = Rig(total_size=4)
	rig.send(stream_frame(1, REF, "leds", b"ab"))

	async def scenario():
		chunk = await rig.stream.__anext__()
		assert bytes(chunk) == b"ab"
		assert rig.responses() == []            # the action still holds it

		rig.send(stream_frame(2, REF, "leds", b"cd"))
		await rig.stream.__anext__()
		assert rig.responses() == [(1, CommandId.STREAM, StreamStatus.OK)]

	run(scenario())


def test_open_ended_stream_ends_on_an_empty_chunk():
	rig = Rig(total_size=0)
	rig.send(
		stream_frame(1, REF, "leds", b"abc"),
		stream_frame(2, REF, "leds", b"defg"),
		stream_frame(3, REF, "leds", b""),
	)

	assert run(_collect(rig.stream)) == [b"abc", b"defg"]
	assert [r[2] for r in rig.responses()] == [StreamStatus.OK] * 3


def test_chunk_for_another_config_gets_waiting():
	rig = Rig(total_size=2)
	rig.send(stream_frame(1, REF, "other", b"zz"), stream_frame(2, REF, "leds", b"ok"))

	assert run(_collect(rig.stream)) == [b"ok"]

	waiting, ok = take_responses(rig.host)
	assert (waiting.frame_id, waiting.command_id, waiting.id) == (1, CommandId.STREAM, StreamStatus.WAITING)
	# What the host should send instead: CONFIG_ID -> STREAM_REF.
	assert waiting.configs == {LEDS: bytes((REF & 0xFF, REF >> 8))}
	assert (ok.frame_id, ok.id) == (2, StreamStatus.OK)


def test_chunk_for_another_stream_ref_gets_waiting():
	rig = Rig(total_size=2)
	rig.send(stream_frame(1, REF + 1, "leds", b"zz"), stream_frame(2, REF, "leds", b"ok"))

	assert run(_collect(rig.stream)) == [b"ok"]
	assert rig.responses()[0] == (1, CommandId.STREAM, StreamStatus.WAITING)


def test_any_other_command_gets_waiting_and_is_not_run():
	rig = Rig(total_size=2)
	rig.send(request_frame(9, CommandId.GET_VERSION), stream_frame(2, REF, "leds", b"ok"))

	assert run(_collect(rig.stream)) == [b"ok"]
	assert rig.responses() == [
		(9, CommandId.STREAM, StreamStatus.WAITING),
		(2, CommandId.STREAM, StreamStatus.OK),
	]


def test_frames_on_another_channel_get_waiting_there():
	rig = Rig(total_size=2)
	rig.other.send(request_frame(5, CommandId.GET_VERSION))
	rig.send(stream_frame(2, REF, "leds", b"ok"))

	assert run(_collect(rig.stream)) == [b"ok"]
	assert rig.responses(rig.other) == [(5, CommandId.STREAM, StreamStatus.WAITING)]


def test_chunk_past_total_size_is_invalid():
	rig = Rig(total_size=2)
	rig.send(stream_frame(1, REF, "leds", b"abc"))

	with pytest.raises(HIOStreamError):
		run(_collect(rig.stream))
	assert rig.responses() == [(1, CommandId.STREAM, StreamStatus.INVALID)]


def test_chunk_splitting_an_element_is_invalid():
	rig = Rig(total_size=4, data_type=DataType.UINT_16)
	rig.send(stream_frame(1, REF, "leds", b"abc"))      # 1.5 UINT_16

	with pytest.raises(HIOStreamError):
		run(_collect(rig.stream))
	assert rig.responses() == [(1, CommandId.STREAM, StreamStatus.INVALID)]


def test_empty_chunk_before_total_size_is_invalid():
	rig = Rig(total_size=4)
	rig.send(stream_frame(1, REF, "leds", b"ab"), stream_frame(2, REF, "leds", b""))

	with pytest.raises(HIOStreamError):
		run(_collect(rig.stream))
	assert rig.responses() == [
		(1, CommandId.STREAM, StreamStatus.OK),
		(2, CommandId.STREAM, StreamStatus.INVALID),
	]


def test_timeout_answers_on_the_stream_ref():
	rig = Rig(total_size=4, timeout_ms=30)

	with pytest.raises(HIOStreamError):
		run(_collect(rig.stream))
	assert rig.responses() == [(REF, CommandId.STREAM, StreamStatus.TIMEOUT)]


def test_failed_stream_keeps_raising():
	rig = Rig(total_size=4, timeout_ms=10)

	async def scenario():
		with pytest.raises(HIOStreamError):
			await rig.stream.__anext__()
		with pytest.raises(HIOStreamError):
			await rig.stream.__anext__()

	run(scenario())


def test_close_answers_the_chunk_still_held():
	rig = Rig(total_size=4)
	rig.send(stream_frame(1, REF, "leds", b"ab"), stream_frame(2, REF, "leds", b"cd"))

	async def scenario():
		await rig.stream.__anext__()
		rig.stream.close()                          # the action ended mid-stream

	run(scenario())
	assert rig.responses() == [(1, CommandId.STREAM, StreamStatus.OK)]
	# Chunk 2 is left in the buffer for the main loop.
	assert rig.reader.poll(rig.ingress.channels[0]).frame_id == 2


def test_read_fills_the_whole_value():
	rig = Rig(total_size=6)
	rig.send(stream_frame(1, REF, "leds", b"abc"), stream_frame(2, REF, "leds", b"def"))

	data = run(rig.stream.read())
	assert data == bytearray(b"abcdef")


def test_read_of_an_open_ended_stream():
	rig = Rig(total_size=0)
	rig.send(stream_frame(1, REF, "leds", b"ab"), stream_frame(2, REF, "leds", b""))

	assert run(rig.stream.read()) == bytearray(b"ab")
