# Raw frames over the REPL — how a host (the driver) talks to the runtime
# through the board's USB REPL, no UART needed:
#
#   from hio.tools.repl import exchange
#   exchange("0207000107...")      # frames to send, hex
#   -> prints "<<0207000201...>>"  # every frame the firmware answered, hex
#
# Hex, not bytes: the frames' ETX is 0x03 — Ctrl-C to the REPL. As text it
# never reaches the wire raw.
#
# The runtime is created on the first call and kept across calls (the module
# stays imported until a soft reset), so state carries over — e.g. RECORD,
# then every EXECUTE of the program, then FINISH_RECORD.

from binascii import hexlify, unhexlify

from .frames import start, feed
from ..system.infrastructure.transports.MemoryTransport import MemoryTransport
from ..system.core import memory

_system = None


def exchange(frames: str) -> None:
	# Runs `frames` (hex) through the runtime and prints what it answered, as
	# hex between "<<" and ">>". The runtime starts on the first call and
	# stays up for the next ones.
	global _system
	if _system is None:
		# Whatever main.py left behind goes first — see memory.py.
		memory.tighten()
		_system = start()

	feed(_system, unhexlify(frames))

	# Delimited, so the host can find it among anything else printed.
	print("<<" + hexlify(MemoryTransport.take()).decode() + ">>")

	# Each call is a line the REPL compiled, and its frames' text: left
	# around, they'd make the heap grow over a session.
	memory.collect()
