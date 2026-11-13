from hio.sdk import HIOAction, action, FALLBACK

from .water import measure


# Water Sensor / Detect — branches Wet or Dry, by whether level reaches
# Threshold: a leak, a full tank, rain.
#
# Wire ids:
#   ACTION_ID  "water sensor/detect"
#   configs    as Read's, under "detect/"
#   outputs    "level" (float, %), "raw" (int)
#   goes out   "wet" or "dry"


@action("water sensor/detect")
class DetectAction(HIOAction):

	async def execute(self, context):
		found = measure(context, "detect")
		if found is None:
			return FALLBACK
		value, percent, wet = found
		context.set("level", percent)
		context.set("raw", value)
		return "wet" if wet else "dry"
