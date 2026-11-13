import math

from hio.sdk import HIOAction, action, FALLBACK

from .sensor import clamp, number, reading, tilt


# IMU / Tilt — branches on which way the sensor leans: Forward, Back, Left,
# Right, or Level while it's within Threshold of flat. From gravity alone, so
# it answers at once — no history to settle.
#
# Split evenly, like the Joystick's Direction: Level is a circle of radius
# Threshold (in degrees of lean), and around it each way is a 90° slice of
# the direction it leans in — a diagonal goes to the slice it falls in.
#
# Wire ids:
#   ACTION_ID  "imu/tilt"
#   configs    as Read's, and "tilt/threshold" (float, degrees)
#   outputs    "pitch", "roll" (float, degrees), "lean" (float, degrees from flat),
#              "tilt" (text: "forward" | "back" | "left" | "right" | "level")
#   goes out   "forward" | "back" | "left" | "right" | "level"

_THRESHOLD = 20.0


def way(angle: float) -> str:
	# The 90° slice of the lean's direction (0 right, 90 forward, counterclockwise).
	if angle < 45 or angle >= 315:
		return "right"
	if angle < 135:
		return "forward"
	if angle < 225:
		return "left"
	return "back"


@action("imu/tilt")
class TiltAction(HIOAction):

	async def execute(self, context):

		found = reading(context, "tilt")
		if found is None:
			return FALLBACK
		_, accel, _, _ = found

		threshold = clamp(number(context.get("tilt/threshold"), _THRESHOLD), 1.0, 90.0)

		pitch, roll = tilt(accel)
		lean = math.sqrt(pitch * pitch + roll * roll)
		leaning = "level" if lean < threshold else way(math.degrees(math.atan2(pitch, roll)) % 360)

		context.set("pitch", pitch)
		context.set("roll", roll)
		context.set("lean", lean)
		context.set("tilt", leaning)
		return leaning
