from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .oled import display, forget, number, parse_points, text, update, wiring


# Display / Draw — a shape: a pixel, a line, a rectangle, a circle, or any
# shape from its vertices (a polygon).
#
# Wire ids:
#   ACTION_ID  "display/draw"
#   configs    "draw/sda pin", "draw/scl pin", "draw/address", "draw/model" (as Print's)
#              "draw/shape"          (options -> "pixel" | "line" | "rectangle" | "circle" | "polygon")
#              "draw/x", "draw/y"    (integer, px; a circle's center, a polygon's origin)
#              "draw/vertices"       (string  -> str, "x,y x,y x,y…" from X/Y; polygon)
#              "draw/x2", "draw/y2"  (integer, px; line's other end)
#              "draw/width", "draw/height" (integer, px; rectangle)
#              "draw/radius"         (integer, px; circle)
#              "draw/fill"           (toggle  -> BOOL; rectangle, circle, polygon)
#              "draw/color"          (options -> "on" | "off": lit pixels, or erase)
#              "draw/update screen"  (toggle  -> BOOL)
#
# Only the shape's own configs are sent (the others are hidden). Off the
# screen is fine: framebuf clips.


def _circle(fb, cx: int, cy: int, r: int, color: int, fill: bool) -> None:
	# framebuf.ellipse (MicroPython 1.20+), or the midpoint circle by hand.
	if hasattr(fb, "ellipse"):
		fb.ellipse(cx, cy, r, r, color, fill)
		return
	x, y, error = r, 0, 1 - r
	while x >= y:
		if fill:
			fb.hline(cx - x, cy + y, 2 * x + 1, color)
			fb.hline(cx - x, cy - y, 2 * x + 1, color)
			fb.hline(cx - y, cy + x, 2 * y + 1, color)
			fb.hline(cx - y, cy - x, 2 * y + 1, color)
		else:
			for px, py in ((x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)):
				fb.pixel(cx + px, cy + py, color)
		y += 1
		if error < 0:
			error += 2 * y + 1
		else:
			x -= 1
			error += 2 * (y - x) + 1


@action("display/draw")
class DrawAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "draw")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		fb = screen.fb
		shape = text(context.get("draw/shape"), "rectangle")
		color = 0 if text(context.get("draw/color"), "on") == "off" else 1
		fill = bool(context.get("draw/fill"))
		x = int(number(context.get("draw/x"), 0))
		y = int(number(context.get("draw/y"), 0))

		if shape == "pixel":
			fb.pixel(x, y, color)
		elif shape == "line":
			fb.line(x, y, int(number(context.get("draw/x2"), 0)), int(number(context.get("draw/y2"), 0)), color)
		elif shape == "rectangle":
			width = int(number(context.get("draw/width"), 0))
			height = int(number(context.get("draw/height"), 0))
			if width <= 0 or height <= 0:
				return FALLBACK
			(fb.fill_rect if fill else fb.rect)(x, y, width, height, color)
		elif shape == "circle":
			radius = int(number(context.get("draw/radius"), 0))
			if radius <= 0:
				return FALLBACK
			_circle(fb, x, y, radius, color, fill)
		elif shape == "polygon":
			points = parse_points(text(context.get("draw/vertices"), ""))
			if points is None:
				return FALLBACK
			screen.polygon(x, y, points, color, fill)
		else:
			return FALLBACK

		if update(context, "draw"):
			try:
				screen.show()
			except OSError:
				forget(screen)
				return FALLBACK
		return SUCCESS
