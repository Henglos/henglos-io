from support import stream_frame, request_frame

from henglosio.sdk.core.identifier import generate_id
from hio.system.core.services.PacketCodec import PacketCodec, CommandId, FrameType, StreamStatus
from hio.system.core.packets.StreamPacket import StreamPacket


def _decode(frame: bytes):
	return PacketCodec.decode(PacketCodec.resolve(bytearray(frame)))


def test_round_trip():
	packet = _decode(stream_frame(0x1234, 0x00AB, "leds", b"\x01\x02\x03"))

	assert isinstance(packet, StreamPacket)
	assert packet.frame_id == 0x1234
	assert packet.stream_ref == 0x00AB
	assert packet.config_id == generate_id("leds")
	assert bytes(packet.chunk) == b"\x01\x02\x03"


def test_empty_chunk_is_valid():
	# The end marker of an open-ended stream.
	packet = _decode(stream_frame(1, 2, "leds", b""))

	assert isinstance(packet, StreamPacket)
	assert len(packet.chunk) == 0


def test_short_body_is_rejected():
	# STREAM_REF + CONFIG_ID need 4 bytes.
	assert _decode(request_frame(1, CommandId.STREAM, b"\x01\x02\x03")) is None


def test_chunk_is_a_view_into_the_frame_buffer():
	# Zero-copy: the chunk points into the scanned buffer.
	buffer = bytearray(stream_frame(1, 2, "leds", b"\xAA\xBB"))
	packet = PacketCodec.decode(PacketCodec.resolve(buffer))

	assert isinstance(packet.chunk, memoryview)
	buffer[buffer.index(0xAA)] = 0xCC
	assert bytes(packet.chunk) == b"\xCC\xBB"


def test_partial_frame_type_is_gone():
	# The old PARTIAL frame type (0x03) isn't decoded anymore — chunks are
	# REQUEST STREAM now.
	frame = PacketCodec.build_frame(0x03, 1, b"\x00\x00\x00\x00\x00\x01")
	assert _decode(frame) is None


def test_stream_ids():
	assert CommandId.STREAM == 0x0B
	assert FrameType.REQUEST == 0x01
	assert StreamStatus.WAITING == 0xFFFA
