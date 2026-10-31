from hio.sdk import HIOAction, action, sleep_ms, SUCCESS, FALLBACK

from .fonts import ADVANCE, width as text_width
from .oled import CHAR, display, forget, format_text, number, printable, show_value, text, wiring


# Display / Scroll — text running across a line, marquee-style: in from one
# side, out the other, Passes times. For a message longer than the line.
#
# Wire ids:
#   ACTION_ID  "display/scroll"
#   configs    "scroll/sda pin", "scroll/scl pin", "scroll/address", "scroll/model" (as Print's)
#              "scroll/text"        (string  -> text — or a bound number/bool)
#              "scroll/format"      (string  -> text, "{}" = Text)
#              "scroll/line"        (number  -> FLOAT_32, 1-based 8-px row)
#              "scroll/font"        (options -> as Print's)
#              "scroll/text size"   (options -> "1".."4")
#              "scroll/direction"   (options -> "left" | "right": where the text moves to)
#              "scroll/speed"       (number  -> FLOAT_32, px a second)
#              "scroll/passes"      (number  -> FLOAT_32, how many times it crosses)
#
# The flow waits here while it scrolls, like a Delay; the line is left blank.
# Only the line's band is sent each frame, so it's smooth even at speed.

_FRAME_MS = 40


@action("display/scroll")
class ScrollAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "scroll")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		font = text(context.get("scroll/font"), "standard")
		if font not in ADVANCE:
			return FALLBACK
		scale = int(text(context.get("scroll/text size"), "1"))
		height = CHAR * scale
		y = (int(number(context.get("scroll/line"), 1)) - 1) * CHAR
		speed = number(context.get("scroll/speed"), 60)
		passes = int(number(context.get("scroll/passes"), 1))
		if not 0 <= y <= screen.height - height or speed <= 0 or passes < 1:
			return FALLBACK

		content = printable(format_text(text(context.get("scroll/format"), ""), show_value(context.get("scroll/text"), 2)))
		span = text_width(content, font) * scale
		leftward = text(context.get("scroll/direction"), "left") == "left"
		step = max(1, round(speed * _FRAME_MS / 1000))
		pages = (y // 8, (y + height - 1) // 8)

		fb = screen.fb
		try:
			for _ in range(passes):
				# From just off one edge to just off the other.
				position = screen.width if leftward else -span
				while (position > -span) if leftward else (position < screen.width):
					fb.fill_rect(0, y, screen.width, height, 0)
					screen.text(content, position, y, scale, font)
					screen.show(pages)
					await sleep_ms(_FRAME_MS)
					position += -step if leftward else step
			fb.fill_rect(0, y, screen.width, height, 0)
			screen.show(pages)
		except OSError:
			forget(screen)
			return FALLBACK

		return SUCCESS
