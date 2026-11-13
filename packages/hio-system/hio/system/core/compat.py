# The few MicroPython-only calls the runtime needs, with CPython stand-ins so
# the same code runs under the host-side tests.

import os

# The clock is the SDK's — actions use the same one (hio.sdk).
from ...sdk.core.clock import sleep_ms, ticks_ms, ticks_diff  # noqa: F401

# Always False at runtime (MicroPython has no `typing`); type checkers read
# any `if TYPE_CHECKING:` block as taken. For imports only types need — e.g.
# a command naming ControlPlane, which itself imports every command.
TYPE_CHECKING = False


def makedirs(path: str) -> None:
	# MicroPython's os has no makedirs — creates every missing level of
	# `path` with os.mkdir, one at a time. Levels that already exist are
	# skipped.
	current = "/" if path.startswith("/") else ""
	for part in path.split("/"):
		if not part: continue
		current += part
		try: os.mkdir(current)
		except OSError: pass
		current += "/"
