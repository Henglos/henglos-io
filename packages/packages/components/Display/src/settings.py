from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .oled import display, forget, number, wiring


# Display / Settings — the screen's brightness, orientation, colors and power.
# What's drawn stays: these change how it's shown.
#
# Wire ids:
#   ACTION_ID  "display/settings"
#   configs    "settings/sda pin", "settings/scl pin", "settings/address", "settings/model" (as Print's)
#              "settings/contrast"       (number -> FLOAT_32, 0-255)
#              "settings/rotate 180"     (toggle -> BOOL)
#              "settings/invert colors"  (toggle -> BOOL)
#              "settings/screen on"      (toggle -> BOOL)


def _toggle(value, default: bool) -> bool:
	return default if value is None else bool(value)


@action("display/settings")
class SettingsAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "settings")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		contrast = int(min(max(number(context.get("settings/contrast"), 207), 0), 255))
		flipped = _toggle(context.get("settings/rotate 180"), False)

		try:
			screen.contrast(contrast)
			if flipped != screen.flipped:
				screen.flip(flipped)
				# The scan direction changed, not the buffer: send it again so
				# what's drawn comes back the right way round.
				screen.show()
			screen.invert(_toggle(context.get("settings/invert colors"), False))
			screen.power(_toggle(context.get("settings/screen on"), True))
		except OSError:
			forget(screen)
			return FALLBACK

		return SUCCESS
