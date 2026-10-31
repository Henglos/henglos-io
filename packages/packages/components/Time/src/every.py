from hio.sdk import HIOAction, action, ticks_ms, ticks_diff, FALLBACK


# Time / Every — paces a loop without blocking it: goes out "Due" once every
# Interval (in Unit), "Waiting" the rest of the time. In a looping program,
# whatever hangs off Due runs on that rhythm while the rest keeps running.
#
#   ACTION_ID  "time/every"
#   configs    "every/interval" (number  -> FLOAT_32)
#              "every/unit"     (options -> text: "ms" | "s" | "min")
#              "every/name"     (string  -> text)
#   outputs    "due" | "wait"
#   output     "elapsed"        (int, milliseconds since the last Due)
#
# The first run is Due. When it last went Due is kept with the values shared
# between actions, under "every/<name>" — Name tells several Every apart.

_UNITS = {"ms": 1, "s": 1000, "min": 60000}

DUE = "due"
WAIT = "wait"


@action("time/every")
class EveryAction(HIOAction):

	async def execute(self, context):

		interval = context.get("every/interval")
		unit = context.get("every/unit")
		name = context.get("every/name")
		scale = _UNITS.get(bytes(unit).decode() if unit is not None else "ms")

		if interval is None or scale is None or interval <= 0 or not name:
			return FALLBACK

		key = "every/" + bytes(name).decode()
		now = ticks_ms()
		last = context.get(key)

		if last is not None:
			elapsed = ticks_diff(now, last)
			context.set("elapsed", elapsed)
			if elapsed < interval * scale:
				return WAIT

		context.set(key, now)
		return DUE
