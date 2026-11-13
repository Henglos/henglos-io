from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .driver import release


# Servo / Release — stops the signal on the pin: a positional servo stops
# holding its angle (goes limp, stops buzzing/drawing current), a continuous
# one stops for good — even one whose Stop Pulse isn't quite calibrated.
#
#   ACTION_ID  "servo/release"
#   configs    "release/signal pin" (pin     -> INTEGER)
#
# Releases the pin's PWM from driver.py — the one To Angle and Rotate drive.
# A pin with no signal is already released: still SUCCESS.

@action("servo/release")
class ReleaseAction(HIOAction):

	async def execute(self, context):

		pin = context.get("release/signal pin")
		if pin is None:
			return FALLBACK

		release(pin)
		return SUCCESS
