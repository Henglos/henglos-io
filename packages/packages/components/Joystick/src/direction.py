import math

from hio.sdk import HIOAction, action, FALLBACK

from .stick import axes, clamp


# Joystick / Direction — branches on where the stick points: Up, Down, Left,
# Right, or Center while it's within Threshold of the middle.
#
# Split evenly: the center is a circle of radius Threshold, and around it
# each way is a 90° slice of the angle — Right 315°-45°, Up 45°-135°, Left
# 135°-225°, Down 225°-315°. (Picking "the axis pushed further" gave the tie
# to X: where both axes top out — the ADC's high end clips before the stick's
# end of travel — down-right always read Right.)
#
# Wire ids:
#   ACTION_ID  "joystick/direction"
#   configs    "direction/x pin", "direction/y pin"  (pin -> UINT_8, analog)
#              "direction/threshold"                 (number -> FLOAT_32, %)
#              "direction/dead zone", "direction/invert x", "direction/invert y",
#              "direction/samples"                   (as Read's)
#   outputs    "x", "y" (float, -100..100), "angle" (float, degrees),
#              "direction" (text: "up" | "down" | "left" | "right" | "center")
#   goes out   "up" | "down" | "left" | "right" | "center"

_THRESHOLD = 50.0


def way(angle: float) -> str:
	# The 90° slice the angle (0..360, 0 right, counterclockwise) falls in.
	if angle < 45 or angle >= 315:
		return "right"
	if angle < 135:
		return "up"
	if angle < 225:
		return "left"
	return "down"


@action("joystick/direction")
class DirectionAction(HIOAction):

	async def execute(self, context):

		position = axes(context, "direction")
		if position is None:
			return FALLBACK
		x, y = position[0], position[1]

		threshold = context.get("direction/threshold")
		threshold = clamp(_THRESHOLD if threshold is None else float(threshold), 1.0, 100.0)

		angle = math.degrees(math.atan2(y, x)) % 360
		direction = "center" if math.sqrt(x * x + y * y) < threshold else way(angle)

		context.set("x", x)
		context.set("y", y)
		context.set("angle", angle)
		context.set("direction", direction)
		return direction
