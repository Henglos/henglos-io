from henglosio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .driver import clamp, frequency, set_duty, text


# PWM / Write — puts a PWM signal on a pin: Duty % of the time HIGH, at
# Frequency Hz. It's held until the next action on the pin.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "pwm/write"
#   configs    "write/pin"       (pin     -> INTEGER)
#              "write/duty"      (float, %, 0-100)
#              "write/frequency" (integer, Hz, default 1000)
#              "write/scale"     (options -> "linear" | "perceived")
#              "write/invert"    (toggle  -> BOOL)
#   outputs    "duty" (float, the clamped %), "frequency" (int, Hz)


@action("pwm/write")
class WriteAction(HIOAction):

	async def execute(self, context):

		pin = context.get("write/pin")
		duty = context.get("write/duty")
		if pin is None or duty is None:
			return FALLBACK

		hz = frequency(context.get("write/frequency"))
		duty = clamp(duty, 0, 100)
		set_duty(pin, hz, duty, text(context.get("write/scale"), "linear"), bool(context.get("write/invert")))

		context.set("duty", float(duty))
		context.set("frequency", hz)
		return SUCCESS
