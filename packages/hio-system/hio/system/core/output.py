# What the firmware sends back: RESPONSE and DEBUG frames. Plain functions —
# a command only needs the transport its frame came in on.
#
# `transport` is None for a frame of the stored program: nobody is waiting
# for its answer, so nothing is written.

from .services.PacketCodec import PacketCodec

# DEBUG frames carry a free-running id — nothing echoes it back.
_debugFrameId = 0


def respond(transport, frame_id: int, command_id: int, id: int = 0, configs=None) -> None:
	# Answers the frame `frame_id` with a RESPONSE: `id` (an OUTPUT_ID, a
	# status) and the values in `configs`.
	if transport is None: return
	transport.write(PacketCodec.build_response(frame_id, command_id, id, configs))


def debug(transport, level: int, message: str) -> None:
	# Sends a DEBUG frame — a line of the device log, at `level`.
	global _debugFrameId
	if transport is None: return
	_debugFrameId = (_debugFrameId + 1) & 0xFFFF
	transport.write(PacketCodec.build_debug(_debugFrameId, level, message))
