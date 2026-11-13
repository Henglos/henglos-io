from machine import Pin

from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .lcd import display, forget, text, wiring


# LCD / Backlight — turns the display's backlight on or off. What's written
# on it stays (it's just hard to read without the light).
#
# Wire ids:
#   ACTION_ID  "lcd/backlight"
#   configs    "backlight/connection", its pins, "backlight/address", "backlight/size" (as Print's)
#              "backlight/on"             (toggle -> BOOL)
#              "backlight/backlight pin"  (pin -> INTEGER, parallel only)
#
# I2C: the backpack switches it. Parallel: the board drives Backlight Pin
# (the display's A, through a resistor or a transistor) — none set goes out
# Fallback.


@action("lcd/backlight")
class BacklightAction(HIOAction):

	async def execute(self, context):

		on = context.get("backlight/on")
		on = True if on is None else bool(on)

		if text(context.get("backlight/connection"), "i2c") == "parallel":
			# Just a pin: no need to set the display up for it.
			gpio = context.get("backlight/backlight pin")
			if gpio is None:
				return FALLBACK
			Pin(gpio, Pin.OUT).value(1 if on else 0)
			return SUCCESS

		wired = wiring(context, "backlight")
		if wired is None:
			return FALLBACK

		lcd = display(wired)
		if lcd is None:
			return FALLBACK

		try:
			lcd.backlight(on)
		except OSError:
			forget(lcd)
			return FALLBACK

		return SUCCESS
