from support import LoopbackTransport, StubConfig, request_frame

from hio.system.core.services.CommandIngress import CommandIngress
from hio.system.core.services.FrameReader import FrameReader, MAX_WIRE_FRAME_SIZE
from hio.system.core.services.PacketCodec import CommandId


def _reader(*frames: bytes):
	transport = LoopbackTransport()
	for frame in frames:
		transport.send(frame)
	ingress = CommandIngress([transport], StubConfig())
	ingress.update()
	return FrameReader(ingress), ingress, ingress.channels[0]


def test_poll_does_not_consume():
	reader, ingress, channel = _reader(request_frame(7, CommandId.GET_VERSION))

	assert reader.poll(channel).frame_id == 7
	assert reader.poll(channel).frame_id == 7          # still there


def test_consume_moves_to_the_next_frame():
	reader, ingress, channel = _reader(
		request_frame(1, CommandId.GET_VERSION),
		request_frame(2, CommandId.GET_VERSION),
	)

	reader.consume(channel, reader.poll(channel))
	assert reader.poll(channel).frame_id == 2

	reader.consume(channel, reader.poll(channel))
	assert reader.poll(channel) is None
	assert not ingress.hasData(channel)


def test_noise_before_a_frame_is_skipped():
	reader, ingress, channel = _reader(b"ets Jun  8 2016 boot log\r\n" + request_frame(3, CommandId.GET_VERSION))

	frame = reader.poll(channel)
	assert frame.frame_id == 3

	reader.consume(channel, frame)                      # drops the noise too
	assert not ingress.hasData(channel)


def test_noise_that_can_never_be_a_frame_is_dropped():
	reader, ingress, channel = _reader(b"x" * (MAX_WIRE_FRAME_SIZE + 40))

	assert reader.poll(channel) is None
	# Only a tail that could still start a frame is kept.
	assert len(ingress.data(channel)) == MAX_WIRE_FRAME_SIZE - 1


def test_lease_releases_once():
	reader, ingress, channel = _reader(
		request_frame(1, CommandId.GET_VERSION),
		request_frame(2, CommandId.GET_VERSION),
	)

	lease = reader.lease(channel, reader.poll(channel))
	lease.release()
	lease.release()                                     # must not drop frame 2

	assert reader.poll(channel).frame_id == 2
