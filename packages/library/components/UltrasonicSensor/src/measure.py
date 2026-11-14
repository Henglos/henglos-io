from henglosio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .sensor import distance, echo_us, is_unit, text


# Ultrasonic Sensor / Measure — pings and publishes how far the nearest object is.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "ultrasonic sensor/measure"
#   configs    "measure/trigger pin" (pin     -> INTEGER)
#              "measure/echo pin"    (pin     -> INTEGER)
#              "measure/unit"        (options -> str: "cm" | "mm" | "in")
#              "measure/timeout"     (integer, ms, default 30)
#              "measure/temperature" (float, °C, default 20)
#   outputs    "distance" (float, in Unit)
#              "echo"     (int, the echo's length in µs)
#
# No echo within Timeout — nothing in range, or a wiring problem — goes out
# Fallback, publishing nothing.

_TIMEOUT_MS = 30      # ~5 m and back: past the range of an HC-SR04
_TEMPERATURE_C = 20


@action("ultrasonic sensor/measure")
class MeasureAction(HIOAction):

	async def execute(self, context):

		trigger = context.get("measure/trigger pin")
		echo = context.get("measure/echo pin")
		unit = text(context.get("measure/unit"), "cm")
		timeout = context.get("measure/timeout")
		celsius = context.get("measure/temperature")

		timeout = _TIMEOUT_MS if timeout is None else timeout
		celsius = _TEMPERATURE_C if celsius is None else celsius

		if trigger is None or echo is None or trigger == echo or timeout <= 0 or not is_unit(unit):
			return FALLBACK

		duration = echo_us(trigger, echo, timeout)
		if duration is None:
			return FALLBACK

		context.set("distance", distance(duration, unit, celsius))
		context.set("echo", duration)
		return SUCCESS
