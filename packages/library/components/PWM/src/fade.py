from hio.sdk import HIOAction, action, sleep_ms, SUCCESS, FALLBACK

from .driver import clamp, frequency, last_duty, set_duty, text


# PWM / Fade — moves a pin's duty smoothly from one value to another over
# Duration, then holds it — a LED fading in, a motor easing up.
#
# Wire ids:
#   ACTION_ID  "pwm/fade"
#   configs    "fade/pin"        (pin     -> INTEGER)
#              "fade/to"         (float, %, 0-100)
#              "fade/duration"   (integer, ms)
#              "fade/from"       (float, %; unset: where the pin is)
#              "fade/frequency"  (integer, Hz, default 1000)
#              "fade/scale"      (options -> "linear" | "perceived")
#              "fade/invert"     (toggle  -> BOOL)
#   outputs    "duty" (float, where it ended: To)
#
# One step every _STEP_MS: the sleeps let the runtime keep running, but the
# program waits here until the fade is done, like a Delay.

_STEP_MS = 10


@action("pwm/fade")
class FadeAction(HIOAction):

	async def execute(self, context):

		pin = context.get("fade/pin")
		target = context.get("fade/to")
		duration = context.get("fade/duration")
		if pin is None or target is None or duration is None or duration < 0:
			return FALLBACK

		start = context.get("fade/from")
		start = last_duty(pin) if start is None else clamp(start, 0, 100)
		target = clamp(target, 0, 100)
		hz = frequency(context.get("fade/frequency"))
		scale = text(context.get("fade/scale"), "linear")
		invert = bool(context.get("fade/invert"))

		steps = max(1, round(duration / _STEP_MS))
		for step in range(1, steps + 1):
			set_duty(pin, hz, start + (target - start) * step / steps, scale, invert)
			if step < steps:
				await sleep_ms(_STEP_MS)

		context.set("duty", float(target))
		return SUCCESS
