from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .oled import display, forget, number, text, update, wiring


# Display / Chart — a value's history as a graph: each run adds the value
# on the right and scrolls the older ones left — a reading over time.
#
# Wire ids:
#   ACTION_ID  "display/chart"
#   configs    "chart/sda pin", "chart/scl pin", "chart/address", "chart/model" (as Print's)
#              "chart/value"                (float — usually bound)
#              "chart/min", "chart/max"     (float; empty: fit the history)
#              "chart/x", "chart/y", "chart/width", "chart/height" (integer, px)
#              "chart/style"                (options -> "line" | "bars" | "dots")
#              "chart/border"               (toggle  -> BOOL)
#              "chart/update screen"        (toggle  -> BOOL)
#   outputs    "minimum", "maximum", "average" (float, of the history shown)
#
# One sample a pixel column. The history is kept per chart area (same wiring,
# position and size), across runs — a new area starts empty.

_histories = {}


@action("display/chart")
class ChartAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "chart")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		value = context.get("chart/value")
		if value is None:
			return FALLBACK

		x = int(number(context.get("chart/x"), 0))
		y = int(number(context.get("chart/y"), 0))
		width = int(number(context.get("chart/width"), screen.width))
		height = int(number(context.get("chart/height"), screen.height))
		border = context.get("chart/border")
		border = True if border is None else bool(border)
		inset = 1 if border else 0
		plot_width, plot_height = width - 2 * inset, height - 2 * inset
		if plot_width < 2 or plot_height < 2:
			return FALLBACK

		key = (wired, x, y, width, height)
		history = _histories.setdefault(key, [])
		history.append(float(value))
		del history[:-plot_width]

		low = context.get("chart/min")
		high = context.get("chart/max")
		low = min(history) if low is None else low
		high = max(history) if high is None else high
		if high <= low:
			# A flat history (or a range set backwards): centered.
			low, high = low - 1, low + 1

		style = text(context.get("chart/style"), "line")
		fb = screen.fb
		fb.fill_rect(x, y, width, height, 0)
		if border:
			fb.rect(x, y, width, height, 1)

		left, bottom = x + inset, y + inset + plot_height - 1
		# The newest sample at the right edge.
		start = left + plot_width - len(history)
		previous = None
		for index, sample in enumerate(history):
			fraction = min(max((sample - low) / (high - low), 0.0), 1.0)
			px = start + index
			py = bottom - round(fraction * (plot_height - 1))
			if style == "bars":
				fb.vline(px, py, bottom - py + 1, 1)
			elif style == "dots":
				fb.pixel(px, py, 1)
			else:
				if previous is None:
					fb.pixel(px, py, 1)
				else:
					fb.line(px - 1, previous, px, py, 1)
				previous = py

		context.set("minimum", min(history))
		context.set("maximum", max(history))
		context.set("average", sum(history) / len(history))

		if update(context, "chart"):
			try:
				screen.show()
			except OSError:
				forget(screen)
				return FALLBACK
		return SUCCESS
