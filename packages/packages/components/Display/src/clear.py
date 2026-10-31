from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .oled import CHAR, display, forget, number, text, update, wiring


# Display / Clear — blanks the whole screen, or one 8-px line of it.
#
# Wire ids:
#   ACTION_ID  "display/clear"
#   configs    "clear/sda pin", "clear/scl pin", "clear/address", "clear/model" (as Print's)
#              "clear/area"           (options -> "all" | "line")
#              "clear/line"           (number  -> FLOAT_32, 1-based; Area "line" only)
#              "clear/update screen"  (toggle  -> BOOL)


@action("display/clear")
class ClearAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "clear")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		if text(context.get("clear/area"), "all") == "line":
			y = (int(number(context.get("clear/line"), 1)) - 1) * CHAR
			if not 0 <= y <= screen.height - CHAR:
				return FALLBACK
			screen.fb.fill_rect(0, y, screen.width, CHAR, 0)
		else:
			screen.clear()

		if update(context, "clear"):
			try:
				screen.show()
			except OSError:
				forget(screen)
				return FALLBACK
		return SUCCESS
