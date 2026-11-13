from machine import Pin, SoftI2C
import framebuf

from . import fonts


# The drawing every action shares — a monochrome I2C OLED: SSD1306 (the
# 0.96" 128x64 / 128x32 modules) or SH1106 (the 1.3" 128x64 ones). Actions
# draw into a frame buffer in RAM (MicroPython's framebuf, built in) and
# send it to the screen with show() — so several actions can compose one
# screen and push it once (see each action's Update Screen).

# Model -> (controller, width, height).
MODELS = {
	"ssd1306_128x64": ("ssd1306", 128, 64),
	"ssd1306_128x32": ("ssd1306", 128, 32),
	"sh1106_128x64": ("sh1106", 128, 64),
}

# framebuf's built-in font: 8x8 pixels per character.
CHAR = 8


class Display:

	def __init__(self, i2c, address: int, controller: str, width: int, height: int) -> None:
		self._i2c = i2c
		self._address = address
		self.controller = controller
		self.width = width
		self.height = height
		self.pages = height // 8
		self.buffer = bytearray(width * self.pages)
		# MONO_VLSB: a byte is 8 vertical pixels of one column — the
		# controllers' own page layout, so the buffer goes out as is.
		self.fb = framebuf.FrameBuffer(self.buffer, width, height, framebuf.MONO_VLSB)
		self.flipped = False
		self._initialize()

	def _command(self, *values: int) -> None:
		for value in values:
			self._i2c.writeto(self._address, bytes((0x80, value)))

	def _data(self, data) -> None:
		self._i2c.writeto(self._address, b"\x40" + data)

	def _initialize(self) -> None:
		# The usual sequences (MicroPython's ssd1306.py, the SH1106 datasheet):
		# off, clocks and multiplex for this height, charge pump on, on.
		tall = self.height > 32
		if self.controller == "sh1106":
			self._command(
				0xAE, 0xD5, 0x80, 0xA8, self.height - 1, 0xD3, 0x00, 0x40,
				0xAD, 0x8B,             # DC-DC on
				0xA1, 0xC8, 0xDA, 0x12,
				0x81, 0xCF, 0xD9, 0x1F, 0xDB, 0x40,
				0xA4, 0xA6,
			)
		else:
			self._command(
				0xAE, 0x20, 0x00,       # horizontal addressing
				0x40, 0xA1, 0xA8, self.height - 1, 0xC8, 0xD3, 0x00,
				0xDA, 0x12 if tall else 0x02,
				0xD5, 0x80, 0xD9, 0xF1, 0xDB, 0x30, 0x81, 0xCF,
				0xA4, 0xA6,
				0x8D, 0x14,             # charge pump on
			)
		self.clear()
		self.show()
		self._command(0xAF)

	def show(self, pages=None) -> None:
		# The buffer to the screen — all of it, or only pages (first, last):
		# 8-px bands, e.g. one line while it scrolls.
		first, last = pages if pages else (0, self.pages - 1)
		first, last = max(first, 0), min(last, self.pages - 1)
		if self.controller == "sh1106":
			# Page addressing only, and 132 columns of RAM with the 128 visible
			# ones from column 2.
			for page in range(first, last + 1):
				self._command(0xB0 | page, 0x02, 0x10)
				start = page * self.width
				self._data(self.buffer[start:start + self.width])
		else:
			self._command(0x21, 0, self.width - 1, 0x22, first, last)
			self._data(self.buffer[first * self.width:(last + 1) * self.width])

	def clear(self) -> None:
		self.fb.fill(0)

	# --- settings ---

	def contrast(self, value: int) -> None:
		self._command(0x81, value)

	def flip(self, on: bool) -> None:
		# Rotated 180°: columns and rows scanned the other way.
		self.flipped = on
		self._command(0xA0 if on else 0xA1, 0xC0 if on else 0xC8)

	def invert(self, on: bool) -> None:
		self._command(0xA7 if on else 0xA6)

	def power(self, on: bool) -> None:
		self._command(0xAF if on else 0xAE)

	# --- drawing ---

	def text(self, content: str, x: int, y: int, scale: int, font: str = "standard", color: int = 1) -> None:
		# `content` in `font` (see fonts.py), `scale` times bigger: each lit
		# pixel of its columns as a scale x scale block. Only lit pixels are
		# drawn — what's under the text stays.
		if font == "standard" and scale <= 1:
			self.fb.text(content, x, y, color)
			return
		fb = self.fb
		for cx, column in enumerate(fonts.columns(content, font)):
			if not column:
				continue
			px = x + cx * scale
			if px >= self.width:
				break
			for bit in range(CHAR):
				if column >> bit & 1:
					fb.fill_rect(px, y + bit * scale, scale, scale, color)

	def bitmap(self, data, width: int, x: int, y: int, scale: int, color: int, transparent: bool) -> int:
		# A MONO_HLSB bitmap (rows of ceil(width / 8) bytes, MSB = leftmost —
		# image2cpp's "horizontal"), `scale` times bigger. Its lit pixels in
		# `color`; the others in the opposite one, unless `transparent`.
		# Returns its height.
		row_bytes = (width + 7) // 8
		height = len(data) // row_bytes
		fb = self.fb
		for ry in range(height):
			for rx in range(width):
				on = data[ry * row_bytes + rx // 8] >> (7 - rx % 8) & 1
				if on:
					fb.fill_rect(x + rx * scale, y + ry * scale, scale, scale, color)
				elif not transparent:
					fb.fill_rect(x + rx * scale, y + ry * scale, scale, scale, 1 - color)
		return height

	def polygon(self, x: int, y: int, points, color: int, fill: bool) -> None:
		# The closed shape through `points` ([(x, y), ...], relative to x, y).
		fb = self.fb
		if hasattr(fb, "poly"):
			from array import array
			coords = array("h")
			for px, py in points:
				coords.append(px)
				coords.append(py)
			fb.poly(x, y, coords, color, fill)
			return
		# framebuf.poly is MicroPython 1.20+: the outline by hand, and the
		# inside by scanlines (even-odd, sampled at each row's middle).
		count = len(points)
		if fill:
			ys = [py for _, py in points]
			for row in range(min(ys), max(ys) + 1):
				middle = row + 0.5
				crossings = []
				for i in range(count):
					x1, y1 = points[i]
					x2, y2 = points[(i + 1) % count]
					if (y1 <= middle) != (y2 <= middle):
						crossings.append(x1 + (middle - y1) * (x2 - x1) / (y2 - y1))
				crossings.sort()
				for i in range(0, len(crossings) - 1, 2):
					start = int(crossings[i] + 0.5)
					end = int(crossings[i + 1] - 0.5)
					if end >= start:
						fb.hline(x + start, y + row, end - start + 1, color)
		for i in range(count):
			x1, y1 = points[i]
			x2, y2 = points[(i + 1) % count]
			fb.line(x + x1, y + y1, x + x2, y + y2, color)


# One Display per wiring, kept across runs: setting one up blanks it — every
# action and node on the same wiring shares it, so a Print doesn't wipe what
# a Draw left.
_displays = {}


def display(wired) -> "Display | None":
	# The display on that wiring (see wiring()) — None when nothing answers
	# at the address (wrong address or pins, unpowered).
	found = _displays.get(wired)
	if found is not None:
		return found

	sda, scl, address, model = wired
	controller, width, height = MODELS[model]
	try:
		i2c = SoftI2C(scl=Pin(scl), sda=Pin(sda), freq=400000)
		found = Display(i2c, address, controller, width, height)
	except OSError:
		return None

	_displays[wired] = found
	return found


def forget(found: Display) -> None:
	# Drops a display that stopped answering — the next action sets it up again.
	for key, value in list(_displays.items()):
		if value is found:
			del _displays[key]


def wiring(context, action: str):
	# (sda, scl, address, model) of `action`'s configs — the key a display
	# is kept under — or None when one is missing or makes no sense.
	sda = context.get(action + "/sda pin")
	scl = context.get(action + "/scl pin")
	address = parse_address(text(context.get(action + "/address"), "0x3C"))
	model = text(context.get(action + "/model"), "ssd1306_128x64")
	if sda is None or scl is None or sda == scl or address is None or model not in MODELS:
		return None
	return sda, scl, address, model


def update(context, action: str) -> bool:
	# Update Screen: send the buffer now (default), or leave it for a later action.
	value = context.get(action + "/update screen")
	return True if value is None else bool(value)


def parse_address(value: str) -> "int | None":
	# Hex, as the modules print it: "0x3C" or "3C" -> 0x3C. None outside the 7-bit range.
	value = value.strip().lower()
	if value.startswith("0x"):
		value = value[2:]
	try:
		address = int(value, 16)
	except ValueError:
		return None
	return address if 0 <= address <= 0x7F else None


def text(value, default: str) -> str:
	# A string/options config arrives as a str.
	return str(value) if value is not None else default


def number(value, default: float) -> float:
	return default if value is None else value


def show_value(value, decimals: int) -> str:
	# What Text shows — text as is, a bound number or bool formatted: whole
	# numbers without decimals, others with `decimals`.
	if value is None:
		return ""
	if isinstance(value, bool):
		return "ON" if value else "OFF"
	if isinstance(value, float):
		if value == int(value) and abs(value) < 1e9:
			return str(int(value))
		return ("%." + str(decimals) + "f") % value
	if isinstance(value, int):
		return str(value)
	return value if isinstance(value, str) else bytes(value).decode()


def format_text(template: str, value: str) -> str:
	# Format around Text: "{}" stands for it ("Temp: {} C"); without one,
	# Format goes before it. Empty: just the Text.
	if not template:
		return value
	if "{}" in template:
		return template.replace("{}", value, 1)
	return template + value


def parse_points(value: str) -> "list | None":
	# "x,y x,y x,y" (or ";" between them) -> [(x, y), ...]; None unless it's
	# at least 3 whole-number vertices.
	points = []
	for pair in value.replace(";", " ").split():
		parts = pair.split(",")
		if len(parts) != 2:
			return None
		try:
			points.append((int(parts[0]), int(parts[1])))
		except ValueError:
			return None
	return points if len(points) >= 3 else None


def decode_bitmap(value: str, encoding: str) -> "bytes | None":
	# The bytes of a typed bitmap: hex ("00ff…", "0x00, 0xFF" pasted from
	# image2cpp works too) or base64. None when it isn't valid.
	import binascii
	try:
		if encoding == "base64":
			return binascii.a2b_base64(value.strip())
		digits = value.lower().replace("0x", "").replace(",", "").replace(" ", "").replace("\n", "")
		return binascii.unhexlify(digits)
	except (ValueError, TypeError):
		return None


def read_pbm(path: str):
	# A P4 PBM on the board's filesystem (an attached file — the studio turns
	# images into one) -> (width, rows): rows of ceil(width / 8) bytes, MSB
	# first, a set bit lit — what Display.bitmap() draws. None when it's
	# missing or isn't one.
	try:
		with open(path, "rb") as file:
			data = file.read()
	except OSError:
		return None
	if data[:2] != b"P4":
		return None

	# Three header fields' worth: "P4", width, height — whitespace between, "#" comments skipped.
	fields = []
	index = 2
	while len(fields) < 2 and index < len(data):
		char = data[index]
		if char == 35:                                   # "#": to the end of the line
			while index < len(data) and data[index] != 10:
				index += 1
		elif 48 <= char <= 57:                           # a number
			start = index
			while index < len(data) and 48 <= data[index] <= 57:
				index += 1
			fields.append(int(str(data[start:index], "ascii")))
			continue
		index += 1
	if len(fields) < 2:
		return None
	width, height = fields
	rows = data[index + 1:index + 1 + ((width + 7) // 8) * height]     # one whitespace after the height
	if width < 1 or len(rows) != ((width + 7) // 8) * height:
		return None
	return width, rows


def printable(content: str) -> str:
	# framebuf's font is ASCII: accents as their plain letter, the rest "?".
	plain = {"á": "a", "à": "a", "â": "a", "ã": "a", "é": "e", "ê": "e", "í": "i", "ó": "o", "ô": "o", "õ": "o",
		"ú": "u", "ü": "u", "ç": "c", "Á": "A", "À": "A", "Â": "A", "Ã": "A", "É": "E", "Ê": "E", "Í": "I",
		"Ó": "O", "Ô": "O", "Õ": "O", "Ú": "U", "Ç": "C", "°": "o"}
	out = ""
	for char in content:
		char = plain.get(char, char)
		out += char if 32 <= ord(char) < 127 else "?"
	return out
