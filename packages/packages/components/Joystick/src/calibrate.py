from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .stick import calibrate, clipped


# Joystick / Calibrate — takes where the stick rests now as its center, for
# Read and Direction on the same pins. Without it, the first reading at rest after
# the board starts is the center — fine if nobody touches the stick then.
#
# Wire ids:
#   ACTION_ID  "joystick/calibrate"
#   configs    "calibrate/x pin", "calibrate/y pin"  (pin -> UINT_8, analog)
#   outputs    "center_x", "center_y" (int, the raw readings at rest, 0..65535)


@action("joystick/calibrate")
class CalibrateAction(HIOAction):

	async def execute(self, context):

		x_pin = context.get("calibrate/x pin")
		y_pin = context.get("calibrate/y pin")
		if x_pin is None or y_pin is None or x_pin == y_pin:
			return FALLBACK

		center_x, center_y = calibrate(x_pin), calibrate(y_pin)
		context.set("center_x", center_x)
		context.set("center_y", center_y)
		# At an end of the scale it's not a center — the ADC is clipping (see stick.adc).
		return FALLBACK if clipped(center_x) or clipped(center_y) else SUCCESS
