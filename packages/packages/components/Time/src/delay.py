from hio.sdk import HIOAction, action, sleep_ms, SUCCESS, FALLBACK


# Time / Delay — waits for Duration (in Unit), then continues.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "time/delay"
#   configs    "delay/duration" (number  -> FLOAT_32)
#              "delay/unit"     (options -> text: "ms" | "s" | "min")
#   output     "duration"       (int, the time waited in milliseconds)
#
# The wait is a sleep, not a busy loop: the rest of the runtime keeps running
# meanwhile — but the program itself stops here, nothing after it runs yet.

_UNITS = {"ms": 1, "s": 1000, "min": 60000}


@action("time/delay")
class DelayAction(HIOAction):

	async def execute(self, context):

		duration = context.get("delay/duration")
		unit = context.get("delay/unit")
		scale = _UNITS.get(bytes(unit).decode() if unit is not None else "ms")

		if duration is None or scale is None or duration < 0:
			return FALLBACK

		# round, not int: Duration arrives as a float32 — 0.06 s is
		# 0.0599999..., which int() would cut to 59 ms.
		ms = round(duration * scale)
		await sleep_ms(ms)

		context.set("duration", ms)
		return SUCCESS
