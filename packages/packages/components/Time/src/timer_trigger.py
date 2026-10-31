from hio.sdk import HIOTrigger, trigger, ticks_ms, ticks_diff


# Time / Timer Trigger — runs its branch every Interval ms, on its own,
# without a loop on Start. Late (a branch ran long) it fires once, not once
# per missed tick.
#
# Wire ids:
#   ACTION_ID  "time/timer trigger"
#   configs    "timer trigger/interval" (number -> FLOAT_32, ms)
#   outputs    "count" (int — how many times it fired since armed)

_MIN_INTERVAL_MS = 10
_DEFAULT_INTERVAL_MS = 1000


@trigger("time/timer trigger")
class TimerTrigger(HIOTrigger):

	def arm(self, context) -> None:
		interval = context.get("timer trigger/interval")
		self._interval = max(_MIN_INTERVAL_MS, int(interval) if isinstance(interval, (int, float)) else _DEFAULT_INTERVAL_MS)
		self._last = ticks_ms()
		self._count = 0

	def poll(self, context) -> bool:
		now = ticks_ms()
		if ticks_diff(now, self._last) < self._interval:
			return False
		self._last = now
		self._count += 1
		context.set("count", self._count)
		return True
