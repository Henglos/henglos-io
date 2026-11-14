from henglosio.sdk import HIOAction, action, sleep_ms, FALLBACK

from .stick import clamp, pressed


# Joystick / Button — branches on the stick's push button: Pressed or Released.
# Read twice, Debounce apart, and only a reading that holds counts — a button
# chatters for a few milliseconds when it's pushed or let go.
#
# Wire ids:
#   ACTION_ID  "joystick/button"
#   configs    "button/button pin"  (pin     -> INTEGER)
#              "button/debounce"    (integer, ms)
#   outputs    "pressed" (bool)
#   goes out   "pressed" | "released"

_DEBOUNCE_MS = 20


@action("joystick/button")
class ButtonAction(HIOAction):

	async def execute(self, context):

		pin = context.get("button/button pin")
		if pin is None:
			return FALLBACK

		debounce = context.get("button/debounce")
		debounce = int(clamp(_DEBOUNCE_MS if debounce is None else debounce, 0, 500))

		down = pressed(pin)
		if debounce:
			await sleep_ms(debounce)
			# Still the same after the wait: that's the button, not its chatter.
			down = down and pressed(pin)

		context.set("pressed", down)
		return "pressed" if down else "released"
