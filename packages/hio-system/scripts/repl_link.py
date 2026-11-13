# Host side of hio/tools/repl.py: sends raw frames to the board through its
# REPL (mpremote's raw REPL) and returns the raw frames it answered. The same
# exchange the driver does — this is the reference for it, and a manual test:
#
#   python scripts/repl_link.py --port COM5               sends a GET_VERSION
#   python scripts/repl_link.py --port COM5 --hex 0207... sends these frames
#
# Protocol, for reimplementing elsewhere (e.g. the driver, in TS):
#   1. enter the raw REPL: Ctrl-C Ctrl-C (stops main.py), Ctrl-A
#   2. send   from hio.tools.repl import exchange\nexchange("<frames, hex>")
#      then Ctrl-D; the board answers "OK", the output, \x04, errors, \x04>
#   3. the answer is the hex between "<<" and ">>" in the output
#   4. repeat 2-3 as needed — the runtime and its state stay alive
#   5. leave: Ctrl-B, then Ctrl-D (soft reset) so main.py starts again
#
# Needs `pip install mpremote`.

import argparse
import os
import re
import sys

from mpremote.transport_serial import SerialTransport

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_REPLY = re.compile(rb"<<([0-9a-f]*)>>")


class ReplLink:
	# An open link to the board's raw REPL, with hio.tools.repl imported —
	# exchange() as many times as needed, then close().

	def __init__(self, port: str, baudrate: int = 115200) -> None:
		self._transport = SerialTransport(port, baudrate=baudrate)
		# No soft reset: it would only restart main.py — the REPL stops it anyway.
		self._transport.enter_raw_repl(soft_reset=False)
		self._transport.exec("from hio.tools.repl import exchange")

	def exchange(self, frames: bytes) -> bytes:
		output = self._transport.exec('exchange("%s")' % frames.hex())
		match = _REPLY.search(output)
		if match is None:
			raise RuntimeError("no reply from the board: %r" % output)
		return bytes.fromhex(match.group(1).decode())

	def close(self, restart: bool = True) -> None:
		# Back to the normal REPL; a soft reset there runs main.py again.
		self._transport.exit_raw_repl()
		if restart:
			self._transport.write_ctrl_d(lambda data: None)
		self._transport.close()


def _codec():
	# The repo's own PacketCodec, to build and decode frames here on the host.
	import types
	sys.modules.setdefault("micropython", types.SimpleNamespace(const=lambda value: value))
	sys.path.insert(0, ROOT)
	from hio.system.core.services import PacketCodec
	return PacketCodec


def main() -> int:
	# Sends the frames (a GET_VERSION by default) and prints what came back.
	parser = argparse.ArgumentParser(description="Send raw frames to the board over its REPL.")
	parser.add_argument("--port", required=True, help="the board's USB port (e.g. COM5)")
	parser.add_argument("--hex", help="frames to send, hex; default: one GET_VERSION")
	parser.add_argument("--no-restart", action="store_true", help="leave main.py stopped afterwards")
	args = parser.parse_args()

	codec = _codec()
	frames = bytes.fromhex(args.hex) if args.hex else codec.PacketCodec.build_frame(
		codec.FrameType.REQUEST, 1, bytes((codec.CommandId.GET_VERSION,)))

	link = ReplLink(args.port)
	try:
		reply = link.exchange(frames)
	finally:
		link.close(restart=not args.no_restart)

	print("sent:  " + frames.hex())
	print("reply: " + reply.hex())

	while True:
		frame = codec.PacketCodec.resolve(reply)
		if frame is None:
			break
		print("  frame type=0x%02x id=%d payload=%s" % (frame.frame_type, frame.frame_id, bytes(frame.payload).hex()))
		reply = reply[frame.end + 1:]

	return 0


if __name__ == "__main__":
	sys.exit(main())
