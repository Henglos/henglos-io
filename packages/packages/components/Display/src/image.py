from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .icons import ICONS, SIZE
from .oled import decode_bitmap, display, forget, number, read_pbm, text, update, wiring


# Display / Image — a bitmap: one of the built-in 16x16 icons, an attached
# image file (the studio turns it into a 1-bit PBM), or typed-in bytes.
#
# Wire ids:
#   ACTION_ID  "display/image"
#   configs    "image/sda pin", "image/scl pin", "image/address", "image/model" (as Print's)
#              "image/source"       (options -> "icon" | "file" | "custom")
#              "image/icon"         (options -> a name in icons.ICONS; Source icon)
#              "image/bitmap"       (file    -> text: its path on the board, a PBM; Source file)
#              "image/data"         (string  -> text, hex or base64; Source custom)
#              "image/encoding"     (options -> "hex" | "base64"; Source custom)
#              "image/width"        (number  -> FLOAT_32, px; Source custom)
#              "image/x", "image/y" (number  -> FLOAT_32, px: top-left corner)
#              "image/scale"        (options -> "1".."4")
#              "image/color"        (options -> "on" | "off")
#              "image/transparent"  (toggle  -> BOOL: leave unlit pixels as they are)
#              "image/update screen" (toggle -> BOOL)
#   outputs    "width", "height" (int, px, after Scale)
#
# A custom bitmap is MONO_HLSB — image2cpp's "Horizontal - 1 bit per pixel":
# rows of ceil(Width / 8) bytes, MSB first. It has to fit one config
# (MAX_DATA_BUFFER, 64 bytes by default: 16x16 in hex, 24x16 in base64).


@action("display/image")
class ImageAction(HIOAction):

	async def execute(self, context):

		wired = wiring(context, "image")
		if wired is None:
			return FALLBACK
		screen = display(wired)
		if screen is None:
			return FALLBACK

		source = text(context.get("image/source"), "icon")
		if source == "file":
			# An attached file: the config carries where it is on the board.
			bitmap = read_pbm(text(context.get("image/bitmap"), ""))
			if bitmap is None:
				return FALLBACK
			width, data = bitmap
		elif source == "custom":
			data = decode_bitmap(text(context.get("image/data"), ""), text(context.get("image/encoding"), "hex"))
			width = int(number(context.get("image/width"), 0))
			if not data or width <= 0 or len(data) % ((width + 7) // 8):
				return FALLBACK
		else:
			data = ICONS.get(text(context.get("image/icon"), "heart"))
			width = SIZE
			if data is None:
				return FALLBACK

		scale = int(text(context.get("image/scale"), "1"))
		color = 0 if text(context.get("image/color"), "on") == "off" else 1
		transparent = context.get("image/transparent")
		transparent = True if transparent is None else bool(transparent)
		x = int(number(context.get("image/x"), 0))
		y = int(number(context.get("image/y"), 0))

		height = screen.bitmap(data, width, x, y, scale, color, transparent)
		context.set("width", width * scale)
		context.set("height", height * scale)

		if update(context, "image"):
			try:
				screen.show()
			except OSError:
				forget(screen)
				return FALLBACK
		return SUCCESS
