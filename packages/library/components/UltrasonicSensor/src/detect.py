from hio.sdk import HIOAction, action, FALLBACK

from .sensor import distance, echo_us, is_unit, text


# Ultrasonic Sensor / Detect — pings and branches: Near when something is
# closer than Threshold, Far otherwise (no echo at all counts as Far — nothing
# in range).
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "ultrasonic sensor/detect"
#   configs    "detect/trigger pin" (pin     -> INTEGER)
#              "detect/echo pin"    (pin     -> INTEGER)
#              "detect/threshold"   (float, in Unit)
#              "detect/unit"        (options -> str: "cm" | "mm" | "in")
#              "detect/timeout"     (integer, ms, default 30)
#              "detect/temperature" (float, °C, default 20)
#   outputs    "near" | "far"
#   output     "distance" (float, in Unit — only when an echo came back)
#              "near"     (bool)

_TIMEOUT_MS = 30
_TEMPERATURE_C = 20

NEAR = "near"
FAR = "far"


@action("ultrasonic sensor/detect")
class DetectAction(HIOAction):

	async def execute(self, context):

		trigger = context.get("detect/trigger pin")
		echo = context.get("detect/echo pin")
		threshold = context.get("detect/threshold")
		unit = text(context.get("detect/unit"), "cm")
		timeout = context.get("detect/timeout")
		celsius = context.get("detect/temperature")

		timeout = _TIMEOUT_MS if timeout is None else timeout
		celsius = _TEMPERATURE_C if celsius is None else celsius

		if trigger is None or echo is None or trigger == echo or threshold is None or threshold <= 0 or timeout <= 0 or not is_unit(unit):
			return FALLBACK

		duration = echo_us(trigger, echo, timeout)
		value = None if duration is None else distance(duration, unit, celsius)

		near = value is not None and value < threshold
		if value is not None:
			context.set("distance", value)
		context.set("near", near)
		return NEAR if near else FAR
