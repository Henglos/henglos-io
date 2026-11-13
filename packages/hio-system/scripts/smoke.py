# Runs ON THE BOARD, after scripts/upload.py:
#
#   mpremote run scripts/smoke.py
#
# Imports the runtime, sends a GET_VERSION over a MemoryTransport and prints
# the answer — checks the .mpy files load and the whole path (ingress ->
# reader -> ControlPlane -> command -> response) works on real MicroPython.
# Also prints how much RAM the runtime's code takes once imported.

import gc

gc.collect()
free = gc.mem_free()

from hio.tools.frames import start, exchange, get_version

gc.collect()
print("imports: %d bytes, %d bytes free" % (free - gc.mem_free(), gc.mem_free()))

replies = exchange(start(), get_version(1))

if replies:
	for reply in replies:
		print(reply)
else:
	print("no reply — the frame never reached a command (CommandIngress.update?)")
