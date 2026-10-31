import math

from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .oled import display, forget, number, show_value, update, wiring


# Display / Gauge — a dial: a half circle with ticks and a needle pointing at
# a value between Min and Max, and the value written under the needle's pivot.
#
# Wire ids:
#   ACTION_ID  "display/gauge"
#   configs    "gauge/sda pin", "gauge/scl pin", "gauge/address", "gauge/model" (as Print's)
#              "gauge/value"           (number -> FLOAT_32 — usually bound)
#              "gauge/min", "gauge/max" (number -> FLOAT_32)
#              "gauge/x", "gauge/y"    (number -> FLOAT_32, px: the needle's pivot, at the bottom middle)
#              "gauge/radius"          (number -> FLOAT_32, px)
#              "gauge/show value"      (toggle -> BOOL)
#              "gauge/decimals"        (number -> FLOAT_32)
#              "gauge/update screen"   (toggle -> BOOL)
#   outputs    "percent" (float, where the needle points: 0-100)


def _point(cx: int, cy: int, radius: float, fraction: float):
	# On the half circle: 0 at the left, 1 at the right, over the top.
	angle = math.pi * (1 - fraction)
	return round(cx + radius * math.cos(angle)), round(cy - radius * math.sin(angle))


@action("display/gauge")
class GaugeAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "gauge")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		value = context.get("gauge/value")
		low = number(context.get("gauge/min"), 0)
		high = number(context.get("gauge/max"), 100)
		radius = int(number(context.get("gauge/radius"), 30))
		if value is None or high <= low or radius < 8:
			return FALLBACK
		value = float(value)

		cx = int(number(context.get("gauge/x"), screen.width // 2))
		cy = int(number(context.get("gauge/y"), screen.height - 10))
		label = context.get("gauge/show value")
		label = True if label is None else bool(label)
		decimals = min(max(int(number(context.get("gauge/decimals"), 0)), 0), 6)

		fb = screen.fb
		fraction = min(max((value - low) / (high - low), 0.0), 1.0)

		# Its whole area blank: the half circle, and the label's line under it.
		fb.fill_rect(cx - radius, cy - radius, 2 * radius + 1, radius + 1 + (10 if label else 0), 0)

		# The arc, point by point (enough steps to leave no gaps)...
		steps = max(16, radius * 4)
		previous = _point(cx, cy, radius, 0)
		for step in range(1, steps + 1):
			current = _point(cx, cy, radius, step / steps)
			fb.line(previous[0], previous[1], current[0], current[1], 1)
			previous = current
		# ...ticks at every quarter, pointing in...
		for quarter in range(5):
			outer = _point(cx, cy, radius, quarter / 4)
			inner = _point(cx, cy, radius - max(3, radius // 6), quarter / 4)
			fb.line(outer[0], outer[1], inner[0], inner[1], 1)
		# ...and the needle, with its pivot.
		tip = _point(cx, cy, radius - max(4, radius // 4), fraction)
		fb.line(cx, cy, tip[0], tip[1], 1)
		fb.fill_rect(cx - 1, cy - 1, 3, 3, 1)

		if label:
			content = show_value(value, decimals)
			fb.text(content, cx - len(content) * 4, cy + 2, 1)

		context.set("percent", fraction * 100)

		if update(context, "gauge"):
			try:
				screen.show()
			except OSError:
				forget(screen)
				return FALLBACK
		return SUCCESS
