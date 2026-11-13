from hio.sdk import HIOTrigger, trigger, ticks_ms, ticks_diff

from .water import measure, text


# Water Sensor / Water Trigger — runs its branch when the sensor gets wet (a
# leak, the tank full), dries off, or either — read every Interval. Wet
# already when it's armed counts as getting wet.
#
# Wire ids:
#   ACTION_ID  "water sensor/water trigger"
#   configs    as Read's, under "water trigger/", plus "water trigger/fires on"
#              (options -> str: wet | dry | both) and "water trigger/interval" (number, ms)
#   outputs    "level" (float, %), "wet" (bool), "raw" (int)

_MIN_INTERVAL_MS = 50


@trigger("water sensor/water trigger")
class WaterTrigger(HIOTrigger):

	def arm(self, context) -> None:
		if context.get("water trigger/signal pin") is None:
			raise ValueError("no Signal Pin")
		self.fires = text(context.get("water trigger/fires on"), "wet")
		interval = context.get("water trigger/interval")
		self.interval = max(_MIN_INTERVAL_MS, int(500 if interval is None else interval))
		self.last = None                # when it last read — None: not yet
		self.wet = False

	def poll(self, context) -> bool:
		# Never blocks: reads only once Interval has gone by.
		now = ticks_ms()
		if self.last is not None and ticks_diff(now, self.last) < self.interval:
			return False
		first = self.last is None
		self.last = now

		found = measure(context, "water trigger")
		if found is None:
			return False
		value, percent, wet = found
		changed = wet != self.wet or (first and wet)
		self.wet = wet
		if not changed or not (self.fires == "both" or self.fires == ("wet" if wet else "dry")):
			return False

		context.set("level", percent)
		context.set("wet", wet)
		context.set("raw", value)
		return True
