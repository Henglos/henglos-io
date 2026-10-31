from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .water import measure


# Water Sensor / Read — how much of the sensor is under water: level 0..100 %
# (between its Dry and Wet raw levels), wet once level reaches Threshold, and
# the raw reading.
#
# Wire ids:
#   ACTION_ID  "water sensor/read"
#   configs    "read/signal pin", "read/power pin" (pin -> UINT_8; power optional),
#              "read/threshold", "read/samples", "read/dry level", "read/wet level" (number -> FLOAT_32)
#   outputs    "level" (float, %), "wet" (bool), "raw" (int, 0..65535)


@action("water sensor/read")
class ReadAction(HIOAction):

	async def execute(self, context):
		found = measure(context, "read")
		if found is None:
			return FALLBACK
		value, percent, wet = found
		context.set("level", percent)
		context.set("wet", wet)
		context.set("raw", value)
		return SUCCESS
