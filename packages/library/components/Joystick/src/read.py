import math

from henglosio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .stick import axes, pressed


# Joystick / Read — where the stick is: x and y from -100 to 100 (0 at rest),
# how far it's pushed and which way, and whether its button is down.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "joystick/read"
#   configs    "read/x pin", "read/y pin"   (pin    -> INTEGER, analog)
#              "read/button pin"            (pin    -> INTEGER; optional)
#              "read/dead zone"             (float, %)
#              "read/invert x", "read/invert y" (toggle -> BOOL)
#              "read/samples"               (integer)
#   outputs    "x", "y"     (float, -100..100)
#              "magnitude"  (float, 0..100 — how far from the center)
#              "angle"      (float, degrees: 0 right, 90 up — while pushed)
#              "pressed"    (bool — with a Button Pin)


@action("joystick/read")
class ReadAction(HIOAction):

	async def execute(self, context):

		position = axes(context, "read")
		if position is None:
			return FALLBACK
		x, y, raw_x, raw_y = position

		context.set("x", x)
		context.set("y", y)
		# What the ADC read, 0..65535 — to check the wiring when a side doesn't respond.
		context.set("raw_x", raw_x)
		context.set("raw_y", raw_y)
		context.set("magnitude", min(100.0, math.sqrt(x * x + y * y)))
		if x or y:
			context.set("angle", (math.atan2(y, x) * 180 / math.pi) % 360)

		button = context.get("read/button pin")
		if button is not None:
			context.set("pressed", pressed(button))

		return SUCCESS
