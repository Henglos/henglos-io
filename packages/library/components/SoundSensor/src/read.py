from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .sound import listen, publish


# Sound Sensor / Read — how loud it is: level 0..100 % (how far AO swung over
# Window), the raw swing (peak), the module's own DO (detected), and loud —
# level past Threshold, or DO on.
#
# Wire ids:
#   ACTION_ID  "sound sensor/read"
#   configs    "read/analog pin", "read/digital pin" (pin -> INTEGER — one of them at least),
#              "read/threshold", "read/window", "read/full scale" (float),
#              "read/active" (options -> str: high | low)
#   outputs    "level" (float, %), "peak" (int), "detected", "loud" (bool), "error" (text)


@action("sound sensor/read")
class ReadAction(HIOAction):

	async def execute(self, context):
		found = listen(context, "read")
		if found is None:
			context.set("error", "no_pin")
			return FALLBACK
		publish(context, found)
		context.set("error", "")
		return SUCCESS
