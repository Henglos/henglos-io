from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .lcd import display, encode, forget, format_text, layout, show, text, wiring


# LCD / Print — writes text (or a bound value) on a line of the display.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "lcd/print"
#   configs    "print/connection"  (options -> "i2c" | "parallel")
#              I2C:      "print/sda pin", "print/scl pin" (pin     -> INTEGER),
#                        "print/address" (string -> str, hex: "0x27")
#              parallel: "print/rs pin", "print/e pin", "print/d4 pin".."print/d7 pin"
#              "print/size"        (options -> "16x2" | "20x4")
#              "print/text"        (string -> str — or a bound number/bool)
#              "print/format"      (string -> str, "{}" = Text)
#              "print/line"        (options -> "1".."4")
#              "print/align"       (options -> "left" | "center" | "right")
#              "print/column"      (integer, 1-based; Left only)
#              "print/clear line"  (toggle -> BOOL: blank the rest of the line)
#              "print/decimals"    (integer, for a bound float)
#
# The other connection's pins aren't sent (hidden configs never are). A
# typed "\n" goes on to the next line. A display that doesn't answer, or a
# line past the display's, goes out Fallback.

_DECIMALS = 2


@action("lcd/print")
class PrintAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "print")
		if wired is None:
			return FALLBACK

		lcd = display(wired)
		if lcd is None:
			return FALLBACK

		decimals = context.get("print/decimals")
		decimals = _DECIMALS if decimals is None else min(max(int(decimals), 0), 6)

		content = format_text(text(context.get("print/format"), ""), show(context.get("print/text"), decimals))
		content = content.replace("\\n", "\n")

		try:
			line = int(text(context.get("print/line"), "1")) - 1
		except ValueError:
			return FALLBACK
		if not 0 <= line < lcd.rows:
			return FALLBACK

		column = context.get("print/column")
		column = 0 if column is None else int(column) - 1
		align = text(context.get("print/align"), "left")
		fill = context.get("print/clear line")
		fill = True if fill is None else bool(fill)

		try:
			for offset, part in enumerate(content.split("\n")):
				row = line + offset
				if row >= lcd.rows:
					break
				start, data = layout(part, lcd.columns, column, align, fill)
				lcd.move(start, row)
				lcd.write(encode(data))
		except OSError:
			# Stopped answering mid-way: set it up again next time.
			forget(lcd)
			return FALLBACK

		return SUCCESS
