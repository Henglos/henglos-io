from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .lcd import display, forget, text, wiring


# LCD / Clear — blanks the whole display, or one line of it. "Whole display"
# sets the display up again from scratch (~60 ms): a display showing a row of
# blocks — powered, never initialized — comes back with it.
#
# Wire ids:
#   ACTION_ID  "lcd/clear"
#   configs    "clear/connection", its pins, "clear/address", "clear/size" (as Print's)
#              "clear/line"  (options -> "all" | "1".."4")


@action("lcd/clear")
class ClearAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "clear")
		if wired is None:
			return FALLBACK

		lcd = display(wired)
		if lcd is None:
			return FALLBACK

		line = text(context.get("clear/line"), "all")

		try:
			if line == "all":
				# A full reset, not just a clear: it also brings back a display
				# that lost power or missed its first setup (blocks on line 1).
				lcd.reset()
				return SUCCESS

			row = int(line) - 1
			if not 0 <= row < lcd.rows:
				return FALLBACK
			lcd.move(0, row)
			lcd.write(b" " * lcd.columns)
		except (OSError, ValueError):
			forget(lcd)
			return FALLBACK

		return SUCCESS
