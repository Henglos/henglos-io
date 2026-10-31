from machine import Pin, SoftI2C
import time


# The driving every action shares — an HD44780 character LCD (16x2, 20x4),
# in 4-bit mode, over one of two connections:
#
#   "i2c"       a PCF8574 I2C backpack, the usual "I2C LCD" module. Its 8
#               outputs: P0 RS · P1 RW (0: write only) · P2 E · P3 backlight ·
#               P4-P7 D4-D7. SDA/SCL on any GPIO (software I2C).
#   "parallel"  the bare display wired to the board: RS, E and D4-D7 on any
#               six GPIOs, RW to GND — for boards (or modules) without I2C.

_RS = 0x01

_CLEAR = 0x01
_ENTRY_LEFT = 0x06        # cursor moves right, no display shift
_DISPLAY_ON = 0x0C        # display on, cursor and blink off
_FUNCTION_4BIT_2LINE = 0x28
_SET_DDRAM = 0x80

# Where each line starts in the controller's memory — the same on 16x2 and 20x4.
_LINE_OFFSETS = (0x00, 0x40, 0x14, 0x54)

SIZES = {
	"16x2": (16, 2),
	"20x4": (20, 4),
}

# The controller's ROM (A00) has ASCII and katakana, no accents: those are
# written as their plain letter — "Atenção" shows "Atencao". ° is in the ROM.
_PLAIN = {
	"á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a",
	"é": "e", "è": "e", "ê": "e", "ë": "e",
	"í": "i", "ì": "i", "î": "i", "ï": "i",
	"ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o",
	"ú": "u", "ù": "u", "û": "u", "ü": "u",
	"ç": "c", "ñ": "n",
	"Á": "A", "À": "A", "Â": "A", "Ã": "A", "Ä": "A",
	"É": "E", "È": "E", "Ê": "E", "Ë": "E",
	"Í": "I", "Ì": "I", "Î": "I", "Ï": "I",
	"Ó": "O", "Ò": "O", "Ô": "O", "Õ": "O", "Ö": "O",
	"Ú": "U", "Ù": "U", "Û": "U", "Ü": "U",
	"Ç": "C", "Ñ": "N",
}
_DEGREE = 0xDF


def encode(text: str) -> bytes:
	# `text` in the bytes the LCD shows: plain ASCII, accents dropped, ° kept,
	# anything else it has no glyph for as "?".
	out = bytearray()
	for char in text:
		char = _PLAIN.get(char, char)
		code = ord(char)
		if char == "°":
			out.append(_DEGREE)
		elif 32 <= code < 127:
			out.append(code)
		else:
			out.append(ord("?"))
	return bytes(out)


# --- connections ---------------------------------------------------------------
# What the controller is fed through: nibble() latches the high 4 bits of
# `value` with RS = `rs`; byte() sends a whole byte as two of them.

class I2CBus:

	_ENABLE = 0x04
	_BACKLIGHT = 0x08

	def __init__(self, sda: int, scl: int, address: int) -> None:
		self._i2c = SoftI2C(scl=Pin(scl), sda=Pin(sda), freq=100000)
		self._address = address
		self._light = self._BACKLIGHT

	def _write(self, data: bytes) -> None:
		self._i2c.writeto(self._address, data)

	def nibble(self, value: int, rs: int) -> None:
		data = (value & 0xF0) | rs | self._light
		self._write(bytes((data | self._ENABLE, data)))

	def byte(self, value: int, rs: int) -> None:
		# Both nibbles, each with its pulse on E, in a single I2C transaction.
		flags = rs | self._light
		high = (value & 0xF0) | flags
		low = ((value << 4) & 0xF0) | flags
		self._write(bytes((high | self._ENABLE, high, low | self._ENABLE, low)))

	def ping(self) -> None:
		# Raises OSError when nothing answers at the address.
		self._write(bytes((self._light,)))

	def backlight(self, on: bool) -> bool:
		self._light = self._BACKLIGHT if on else 0
		self.ping()
		return True


class ParallelBus:

	def __init__(self, rs: int, enable: int, data: "tuple[int, int, int, int]") -> None:
		# Every line low before anything: E high (or RS/data floating) at
		# power-up can latch garbage before the reset sequence even starts.
		self._rs = Pin(rs, Pin.OUT)
		self._enable = Pin(enable, Pin.OUT)
		self._data = [Pin(gpio, Pin.OUT) for gpio in data]     # D4, D5, D6, D7
		self._enable.value(0)
		self._rs.value(0)
		for pin in self._data:
			pin.value(0)

	def nibble(self, value: int, rs: int) -> None:
		self._rs.value(rs)
		for bit, pin in enumerate(self._data):
			pin.value((value >> (4 + bit)) & 1)
		# E pulse — the controller latches on its falling edge (≥ 450 ns
		# high), then needs time to take it in: clones are slower than the
		# datasheet's 37 µs, so 100 (as MicroPython's python_lcd).
		time.sleep_us(1)
		self._enable.value(1)
		time.sleep_us(1)
		self._enable.value(0)
		time.sleep_us(100)

	def byte(self, value: int, rs: int) -> None:
		self.nibble(value, rs)
		self.nibble(value << 4, rs)

	def ping(self) -> None:
		# Pins can't tell whether a display is there: nothing to check.
		pass

	def backlight(self, on: bool) -> bool:
		# The backlight is on the display's own pins (A/K), not driven from
		# here — see Backlight's Backlight Pin.
		return False


# --- the display ----------------------------------------------------------------

class Lcd:

	def __init__(self, bus, columns: int, rows: int) -> None:
		self._bus = bus
		self.columns = columns
		self.rows = rows
		self._initialize()

	def _byte(self, value: int, rs: int) -> None:
		self._bus.byte(value, rs)
		time.sleep_us(50)

	def command(self, value: int) -> None:
		self._byte(value, 0)
		# Clear and Home take 1.52 ms on paper, past 4 ms on some clones.
		if value <= 0x03:
			time.sleep_ms(5)

	def _initialize(self) -> None:
		# HD44780's "initialization by instruction": into 8-bit mode three
		# times (whatever state it's in — even mid-byte of a 4-bit transfer,
		# when the board restarted and the display didn't), then 4-bit.
		time.sleep_ms(50)
		self._bus.ping()
		for delay_ms in (5, 1, 1):
			self._bus.nibble(0x30, 0)
			time.sleep_ms(delay_ms)
		self._bus.nibble(0x20, 0)
		time.sleep_ms(1)
		for value in (_FUNCTION_4BIT_2LINE, 0x08, _CLEAR, _ENTRY_LEFT, _DISPLAY_ON):
			self.command(value)

	def reset(self) -> None:
		# The whole initialization again — for a display that lost power or
		# never took the first one (a parallel display can't tell us).
		self._initialize()

	def clear(self) -> None:
		self.command(_CLEAR)

	def move(self, column: int, row: int) -> None:
		# 0-based.
		self.command(_SET_DDRAM | (_LINE_OFFSETS[row] + column))

	def write(self, data: bytes) -> None:
		for value in data:
			self._byte(value, _RS)

	def backlight(self, on: bool) -> bool:
		# False when the connection can't switch it (parallel).
		return self._bus.backlight(on)


# One Lcd per wiring, kept across runs: setting one up takes ~60 ms and
# blanks the screen — every action and node on the same wiring shares it,
# so a Print doesn't wipe what the last one wrote.
_displays = {}


def display(wired) -> "Lcd | None":
	# The LCD on that wiring (see wiring()) — None when nothing answers
	# (I2C: wrong address or pins, unpowered).
	lcd = _displays.get(wired)
	if lcd is not None:
		return lcd

	connection, pins, size = wired
	columns, rows = SIZES[size]
	try:
		if connection == "i2c":
			sda, scl, address = pins
			bus = I2CBus(sda, scl, address)
		else:
			rs, enable, d4, d5, d6, d7 = pins
			bus = ParallelBus(rs, enable, (d4, d5, d6, d7))
		lcd = Lcd(bus, columns, rows)
	except OSError:
		return None

	_displays[wired] = lcd
	return lcd


def forget(lcd: Lcd) -> None:
	# Drops a display that stopped answering — the next action sets it up
	# again (it was unplugged, or lost power and came back blank).
	for key, value in list(_displays.items()):
		if value is lcd:
			del _displays[key]


_PARALLEL_PINS = ("rs pin", "e pin", "d4 pin", "d5 pin", "d6 pin", "d7 pin")


def wiring(context, action: str):
	# (connection, pins, size) of `action`'s configs — the key a display is
	# kept under — or None when one is missing or makes no sense.
	connection = text(context.get(action + "/connection"), "i2c")
	size = text(context.get(action + "/size"), "16x2")
	if size not in SIZES:
		return None

	if connection == "i2c":
		sda = context.get(action + "/sda pin")
		scl = context.get(action + "/scl pin")
		address = parse_address(text(context.get(action + "/address"), "0x27"))
		if sda is None or scl is None or sda == scl or address is None:
			return None
		return "i2c", (sda, scl, address), size

	if connection == "parallel":
		pins = tuple(context.get(action + "/" + name) for name in _PARALLEL_PINS)
		if None in pins or len(set(pins)) != len(pins):
			return None
		return "parallel", pins, size

	return None


def parse_address(value: str) -> "int | None":
	# Hex, as the modules print it: "0x27" or "27" -> 0x27. None outside
	# the 7-bit range.
	value = value.strip().lower()
	if value.startswith("0x"):
		value = value[2:]
	try:
		address = int(value, 16)
	except ValueError:
		return None
	return address if 0 <= address <= 0x7F else None


def text(value, default: str) -> str:
	# A string/options config arrives as bytes (its text).
	return bytes(value).decode() if value is not None else default


def show(value, decimals: int) -> str:
	# What a Print's Text config shows — text as is, a bound number or bool
	# formatted: whole numbers without decimals, others with `decimals`.
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
	return bytes(value).decode()


def format_text(template: str, value: str) -> str:
	# Print's Format around its Text: "{}" stands for it ("Temp: {} °C");
	# without one, Format goes before it. Empty: just the Text.
	if not template:
		return value
	if "{}" in template:
		return template.replace("{}", value, 1)
	return template + value


def layout(content: str, columns: int, column: int, align: str, fill: bool):
	# Where on the line `content` goes (0-based column) and what is written
	# there — cut to fit, aligned, and padded with spaces to the end of the
	# line when `fill` (so the rest of what was there is erased).
	if align == "center":
		column = max(0, (columns - len(content)) // 2)
	elif align == "right":
		column = max(0, columns - len(content))
	column = min(max(column, 0), columns - 1)

	content = content[:columns - column]
	if not fill:
		return column, content
	line = " " * column + content
	return 0, line + " " * (columns - len(line))
