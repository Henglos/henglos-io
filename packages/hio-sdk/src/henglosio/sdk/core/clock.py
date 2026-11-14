# Time for actions: MicroPython's millisecond clock and non-blocking sleep,
# with CPython stand-ins so the same code runs under the host-side tests.
#
#   start = ticks_ms()
#   await sleep_ms(250)                       # lets the rest of the runtime run
#   elapsed = ticks_diff(ticks_ms(), start)   # wrap-safe
#
# ticks_ms() wraps around (on MicroPython after ~12.4 days): never compare or
# subtract two of them directly — always through ticks_diff().

import asyncio

try:
	from asyncio import sleep_ms                    # type: ignore  # MicroPython only
except ImportError:
	async def sleep_ms(ms: int) -> None:            # CPython (tests)
		await asyncio.sleep(ms / 1000)

try:
	from time import ticks_ms, ticks_diff           # type: ignore  # MicroPython only
except ImportError:
	import time as _time

	# Same period as MicroPython's ESP32 port (2^30), so wrap-around behaves alike.
	_PERIOD = 1 << 30

	def ticks_ms() -> int:                          # CPython (tests)
		return int(_time.monotonic() * 1000) % _PERIOD

	def ticks_diff(new: int, old: int) -> int:
		return ((new - old + _PERIOD // 2) % _PERIOD) - _PERIOD // 2
