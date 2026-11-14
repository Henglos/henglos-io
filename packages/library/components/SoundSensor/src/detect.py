from henglosio.sdk import HIOAction, action, FALLBACK

from .sound import listen, publish


# Sound Sensor / Detect — branches Loud or Quiet: level past Threshold over
# Window (Analog Pin), or the module's DO on (Digital Pin) — either, with both.
#
# Wire ids:
#   ACTION_ID  "sound sensor/detect"
#   configs    as Read's, under "detect/"
#   outputs    as Read's
#   goes out   "loud" or "quiet"


@action("sound sensor/detect")
class DetectAction(HIOAction):

	async def execute(self, context):
		found = listen(context, "detect")
		if found is None:
			return FALLBACK
		publish(context, found)
		return "loud" if found[2] else "quiet"
