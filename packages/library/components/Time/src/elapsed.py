from henglosio.sdk import HIOAction, action, ticks_ms, ticks_diff, SUCCESS, FALLBACK


# Time / Elapsed — how long since Start Timer started the timer Name.
#
#   ACTION_ID  "time/elapsed"
#   configs    "elapsed/name" (string -> str)
#   output     "elapsed"      (int, milliseconds)
#
# FALLBACK when no Start Timer with this Name ran before it.

@action("time/elapsed")
class ElapsedAction(HIOAction):

	async def execute(self, context):

		name = context.get("elapsed/name")
		if not name:
			return FALLBACK

		started = context.get("timer/" + str(name))
		if started is None:
			return FALLBACK

		context.set("elapsed", ticks_diff(ticks_ms(), started))
		return SUCCESS
