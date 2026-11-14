from henglosio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .fonts import ADVANCE
from .oled import CHAR, display, forget, format_text, number, printable, show_value, text, update, wiring


# Display / Print — writes text (or a bound value) on the screen.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "display/print"
#   configs    "print/sda pin", "print/scl pin"  (pin     -> INTEGER)
#              "print/address"                   (string  -> str, hex: "0x3C")
#              "print/model"                     (options -> see oled.MODELS)
#              "print/text"          (string  -> str — or a bound number/bool)
#              "print/line"          (integer, 1-based 8-px row)
#              "print/font"          (options -> "standard" | "small" | "bold")
#              "print/text size"     (options -> "1".."4": 8, 16, 24, 32 px)
#              "print/align"         (options -> "left" | "center" | "right")
#              "print/column"        (integer, 1-based, in characters; Left only)
#              "print/format"        (string  -> str, "{}" = Text)
#              "print/decimals"      (integer, for a bound float)
#              "print/clear line"    (toggle  -> BOOL: blank the line's band first)
#              "print/update screen" (toggle  -> BOOL: show it now)
#
# A typed "\n" goes on to the next line. A line past the screen goes out Fallback.

_DECIMALS = 2


@action("display/print")
class PrintAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "print")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		font = text(context.get("print/font"), "standard")
		if font not in ADVANCE:
			return FALLBACK
		scale = int(text(context.get("print/text size"), "1"))
		height = CHAR * scale
		advance = ADVANCE[font] * scale
		y = (int(number(context.get("print/line"), 1)) - 1) * CHAR
		if not 0 <= y <= screen.height - CHAR:
			return FALLBACK

		decimals = min(max(int(number(context.get("print/decimals"), _DECIMALS)), 0), 6)
		content = format_text(text(context.get("print/format"), ""), show_value(context.get("print/text"), decimals))
		content = printable(content.replace("\\n", "\n"))

		align = text(context.get("print/align"), "left")
		column = int(number(context.get("print/column"), 1)) - 1
		clear_line = context.get("print/clear line")
		clear_line = True if clear_line is None else bool(clear_line)

		fits = screen.width // advance
		for part in content.split("\n"):
			if y + height > screen.height:
				break
			if clear_line:
				screen.fb.fill_rect(0, y, screen.width, height, 0)
			if align == "center":
				part = part[:fits]
				x = (screen.width - len(part) * advance) // 2
			elif align == "right":
				part = part[:fits]
				x = screen.width - len(part) * advance
			else:
				x = min(max(column, 0), max(fits - 1, 0)) * advance
				part = part[:(screen.width - x) // advance]
			screen.text(part, x, y, scale, font)
			y += height

		if update(context, "print"):
			try:
				screen.show()
			except OSError:
				forget(screen)
				return FALLBACK
		return SUCCESS
