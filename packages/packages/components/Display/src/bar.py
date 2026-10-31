from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .oled import display, forget, number, update, wiring


# Display / Bar — a horizontal bar filled by a value between Min and Max:
# a sensor reading, a level, a progress.
#
# Wire ids:
#   ACTION_ID  "display/bar"
#   configs    "bar/sda pin", "bar/scl pin", "bar/address", "bar/model" (as Print's)
#              "bar/value"               (number -> FLOAT_32 — usually bound)
#              "bar/min", "bar/max"      (number -> FLOAT_32)
#              "bar/x", "bar/y", "bar/width", "bar/height" (number -> FLOAT_32, px)
#              "bar/border"              (toggle -> BOOL)
#              "bar/update screen"       (toggle -> BOOL)
#   outputs    "percent" (float, how full: 0-100)
#
# A value past Min/Max fills it empty/full. No value, or Max not above Min,
# goes out Fallback.


@action("display/bar")
class BarAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "bar")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		value = context.get("bar/value")
		low = number(context.get("bar/min"), 0)
		high = number(context.get("bar/max"), 100)
		if value is None or high <= low:
			return FALLBACK
		value = float(value)

		x = int(number(context.get("bar/x"), 0))
		y = int(number(context.get("bar/y"), 0))
		width = int(number(context.get("bar/width"), screen.width))
		height = int(number(context.get("bar/height"), 8))
		if width < 3 or height < 3:
			return FALLBACK
		border = context.get("bar/border")
		border = True if border is None else bool(border)

		fraction = min(max((value - low) / (high - low), 0.0), 1.0)
		fb = screen.fb
		fb.fill_rect(x, y, width, height, 0)
		# Inside the border (1 px, then a 1-px gap), or the whole box.
		inset = 2 if border else 0
		if border:
			fb.rect(x, y, width, height, 1)
		inner = width - 2 * inset
		filled = round(inner * fraction)
		if filled > 0:
			fb.fill_rect(x + inset, y + inset, filled, height - 2 * inset, 1)

		context.set("percent", fraction * 100)

		if update(context, "bar"):
			try:
				screen.show()
			except OSError:
				forget(screen)
				return FALLBACK
		return SUCCESS
