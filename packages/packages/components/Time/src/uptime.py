from hio.sdk import HIOAction, action, ticks_ms, SUCCESS


# Time / Uptime — publishes the board's millisecond clock.
#
#   ACTION_ID  "time/uptime"
#   output     "uptime" (int, milliseconds)
#
# The clock wraps around (MicroPython: after ~12.4 days) — to measure how long
# something took, use Start Timer + Elapsed, which account for it.

@action("time/uptime")
class UptimeAction(HIOAction):

	async def execute(self, context):
		context.set("uptime", ticks_ms())
		return SUCCESS
