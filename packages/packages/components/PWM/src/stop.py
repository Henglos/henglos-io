from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .driver import stop


# PWM / Stop — cuts the signal and frees the pin.
#
# Wire ids:
#   ACTION_ID  "pwm/stop"
#   configs    "stop/pin"       (pin    -> UINT_8)
#              "stop/hold low"  (toggle -> BOOL, default on)
#
# Hold Low drives the pin LOW afterwards, so what's on it stays off rather
# than floating. A pin with no signal is already stopped: still SUCCESS.


@action("pwm/stop")
class StopAction(HIOAction):

	async def execute(self, context):

		pin = context.get("stop/pin")
		if pin is None:
			return FALLBACK

		hold_low = context.get("stop/hold low")
		stop(pin, True if hold_low is None else bool(hold_low))
		return SUCCESS
