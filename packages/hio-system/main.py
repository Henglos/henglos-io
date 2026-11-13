from hio.system.HIOSystem import HIOSystem
from hio.system.SystemConfig import SystemConfig
from hio.system.core import memory

# Collect early, before the heap has to grow into the memory WiFi and TLS use.
memory.tighten()


# No transport: the host talks to the runtime through the REPL (hio.tools.repl),
# which stops this one first. On its own, the board just plays the stored program.
#
# Inside a function: main.py runs in the REPL's globals, so a module-level
# `system` would outlive the Ctrl-C that stops it — a second runtime held in
# RAM next to the one the host's REPL session starts.
def _run() -> None:
	system = HIOSystem([], SystemConfig())
	system.initialize()
	system.start()


_run()
