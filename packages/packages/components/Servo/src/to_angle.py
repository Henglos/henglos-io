from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .driver import pwm_on


# Servo / To Angle — moves a positional servo (SG90-style, 0-180°) to Angle
# and holds it there: the signal stays on until the next To Angle, Rotate or
# Release on the same pin.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "servo/to angle"
#   configs    "to angle/signal pin" (pin    -> UINT_8)
#              "to angle/angle"      (number -> FLOAT_32, degrees, clamped to 0-180)
#              "to angle/min pulse"  (number -> FLOAT_32, µs at 0°,   default 500)
#              "to angle/max pulse"  (number -> FLOAT_32, µs at 180°, default 2500)
#   output     "angle"               (int, the clamped angle)
#
# A servo's angle is the width of a pulse sent 50 times a second. Most hobby
# servos cover their full 180° somewhere within 500-2500 µs; one that buzzes
# or strains at the ends wants a narrower Min/Max Pulse (e.g. 1000-2000).
#
# The pin's PWM comes from driver.py — one per pin, shared with Rotate and
# Release.

_MIN_PULSE = 500
_MAX_PULSE = 2500


@action("servo/to angle")
class ToAngleAction(HIOAction):

	async def execute(self, context):

		pin = context.get("to angle/signal pin")
		angle = context.get("to angle/angle")
		low = context.get("to angle/min pulse")
		high = context.get("to angle/max pulse")

		low = _MIN_PULSE if low is None else low
		high = _MAX_PULSE if high is None else high

		if pin is None or angle is None or not 0 < low < high:
			return FALLBACK

		angle = min(max(angle, 0), 180)
		pulse_us = low + (high - low) * angle / 180

		pwm_on(pin).duty_ns(round(pulse_us * 1000))

		context.set("angle", round(angle))
		return SUCCESS
