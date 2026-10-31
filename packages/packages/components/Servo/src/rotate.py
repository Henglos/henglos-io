from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .driver import pwm_on


# Servo / Rotate — spins a continuous-rotation servo (360°) at Speed in
# Direction; Speed 0 stops it. The signal stays on until the next Rotate,
# To Angle or Release on the same pin.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "servo/rotate"
#   configs    "rotate/signal pin" (pin     -> UINT_8)
#              "rotate/speed"      (number  -> FLOAT_32, 0-100 %, clamped)
#              "rotate/direction"  (options -> "clockwise" | "counterclockwise")
#              "rotate/stop pulse" (number  -> FLOAT_32, µs where it stands still, default 1500)
#              "rotate/range"      (number  -> FLOAT_32, µs from stop to full speed, default 500)
#   output     "speed"             (int, the clamped speed)
#
# A continuous servo reads the same pulse as a speed: Stop Pulse stands
# still, wider spins one way, narrower the other, faster the further from it.
# Each unit stops at a slightly different pulse — one that creeps at Speed 0
# wants its Stop Pulse nudged (e.g. 1480 or 1520) until it stays put.
#
# The pin's PWM comes from driver.py — one per pin, shared with To Angle and
# Release.

_STOP_PULSE = 1500
_RANGE = 500


@action("servo/rotate")
class RotateAction(HIOAction):

	async def execute(self, context):

		pin = context.get("rotate/signal pin")
		speed = context.get("rotate/speed")
		direction = context.get("rotate/direction")
		stop = context.get("rotate/stop pulse")
		span = context.get("rotate/range")

		stop = _STOP_PULSE if stop is None else stop
		span = _RANGE if span is None else span
		counterclockwise = direction is not None and bytes(direction) == b"counterclockwise"

		if pin is None or speed is None or stop <= 0 or not 0 <= span < stop:
			return FALLBACK

		speed = min(max(speed, 0), 100)
		offset = span * speed / 100
		pulse_us = stop - offset if counterclockwise else stop + offset

		pwm_on(pin).duty_ns(round(pulse_us * 1000))

		context.set("speed", round(speed))
		return SUCCESS
