from hio.sdk import HIOAction, action, ticks_ms, SUCCESS, FALLBACK


# Time / Start Timer — starts (or restarts) the timer Name; Elapsed reads it.
#
#   ACTION_ID  "time/start timer"
#   configs    "start timer/name" (string -> str)
#
# The start time is kept with the values shared between actions, under
# "timer/<name>" — so any Elapsed with the same Name, anywhere later in the
# program, finds it.

@action("time/start timer")
class StartTimerAction(HIOAction):

	async def execute(self, context):

		name = context.get("start timer/name")
		if not name:
			return FALLBACK

		context.set("timer/" + str(name), ticks_ms())
		return SUCCESS
