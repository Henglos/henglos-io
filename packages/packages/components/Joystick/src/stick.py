from machine import ADC, Pin


# What the Joystick actions share — a 2-axis analog stick with a push button
# (KY-023 and the like: VRx, VRy, SW). Each axis is a potentiometer read by
# the ADC; the button pulls SW to GND when pressed.
#
# Positions are -100..100 per axis, 0 at rest. A stick never rests exactly
# mid-scale, so each axis has a center: its first reading at rest —
# mid-scale while it's held pushed — unless Calibrate set it. Kept per pin,
# across runs.
#
# Readings are levels, 0..65535 for 0..3.3 V. On the ESP32 they come from
# read_uv() — the voltage corrected by the chip's factory calibration:
# read_u16() isn't linear at 11 dB (it flattens towards the top and tops out
# near 3.1 V), so the high side — right, and down (Y is flipped) — read
# bigger than the low side for the same push, and the angle leaned their way.

FULL = 65535                # a level's range
_VREF_UV = 3_300_000        # the stick's supply, what FULL stands for

_adcs = {}                  # pin -> ADC
_centers = {}               # pin -> level at rest


def adc(pin: int) -> ADC:
	# The full 0-3.3 V range: without the 11 dB attenuation an ESP32 reads only
	# up to ~1.1 V, and a stick resting at ~1.65 V is already at the top of the
	# scale — pushing it further up reads nothing new (right/down stay Center).
	found = _adcs.get(pin)
	if found is None:
		try:
			# MicroPython 1.20+ on the ESP32: set in the constructor.
			found = ADC(Pin(pin), atten=ADC.ATTN_11DB)
		except (TypeError, AttributeError, ValueError):
			found = ADC(Pin(pin))
			try:
				found.atten(ADC.ATTN_11DB)
			except (AttributeError, ValueError):
				pass                    # a port without attenuation: its full range already
		# The first conversions after setting up a channel are off — a center
		# taken from them stays off (the stick reads -20 or 30 at rest). Dropped.
		for _ in range(_WARM_UP):
			found.read_u16()
		_adcs[pin] = found
	return found


_WARM_UP = 8
# Readings dropped each time the converter switches to an axis (see level()).
_SETTLE = 2


def _read(reader: ADC) -> int:
	# One level: the calibrated voltage where the port has it, else read_u16().
	try:
		return min(FULL, reader.read_uv() * FULL // _VREF_UV)
	except AttributeError:
		return reader.read_u16()


# A rest reading this close to an end of the scale is clipped, not a center:
# the ADC can't see past it, so one side of the stick would read nothing.
# The top end is where the ESP32 tops out — near 3.1 V, not 3.3 V.
_CLIPPED_LOW = FULL * 2 // 100
_CLIPPED_HIGH = FULL * 90 // 100


def clipped(value: int) -> bool:
	return value <= _CLIPPED_LOW or value >= _CLIPPED_HIGH


def level(pin: int, samples: int) -> int:
	# The axis, averaged over `samples` readings — the ADC is noisy. The
	# ESP32 has one converter switched between the pins: the first readings
	# after a switch still carry the other axis' voltage (pushed diagonally,
	# X read partly as Y), so they're dropped.
	reader = adc(pin)
	for _ in range(_SETTLE):
		reader.read_u16()
	total = 0
	for _ in range(samples):
		total += _read(reader)
	return total // samples


def calibrate(pin: int, samples: int = 16) -> int:
	# The axis at rest now, averaged — kept as its center unless it's clipped
	# (then it's no center: measured again next time).
	center = level(pin, max(samples, 16))
	if clipped(center):
		_centers.pop(pin, None)
	else:
		_centers[pin] = center
	return center


_MID = FULL // 2


def center(pin: int, samples: int) -> int:
	# The axis' rest position — its first reading, if Calibrate never ran.
	# One at an end of the scale is a stick held pushed all the way, not at
	# rest: mid-scale stands in for this run (not kept), and the center is
	# taken once it's let go. Nothing narrower than that: where a stick rests
	# depends on its supply (a module on 5 V rests near 2.5 V), and a center
	# never taken would read rest as pushed forever.
	found = _centers.get(pin)
	if found is not None:
		return found
	value = level(pin, max(samples, 16))
	if clipped(value):
		return _MID
	_centers[pin] = value
	return value


def position(value: int, rest: int, dead_zone: float, invert: bool) -> float:
	# A level as -100..100. Both sides of the center on the same scale — the
	# center's distance to 0 V, the end every axis reaches — so the same push
	# reads the same on every side and the angle is even all the way round.
	# (Each side to its own end made the high side, which tops out early, the
	# bigger one.) The dead zone around the center reads 0, the rest is
	# stretched back to the full range.
	scaled = (value - rest) * 100 / rest if rest else 0.0
	scaled = clamp(scaled, -100.0, 100.0)

	magnitude = abs(scaled)
	if magnitude <= dead_zone:
		return 0.0
	magnitude = min(100.0, (magnitude - dead_zone) * 100 / (100 - dead_zone))
	result = magnitude if scaled > 0 else -magnitude
	return -result if invert else result


def pressed(pin: int) -> bool:
	# SW is pulled to GND when pressed — the internal pull-up holds it high otherwise.
	return Pin(pin, Pin.IN, Pin.PULL_UP).value() == 0


def clamp(value: float, low: float, high: float) -> float:
	return low if value < low else high if value > high else value


def options(context, action: str):
	# The settings Read and Direction share: dead zone (%), inversions, samples.
	dead_zone = context.get(action + "/dead zone")
	samples = context.get(action + "/samples")
	return (
		clamp(10.0 if dead_zone is None else float(dead_zone), 0.0, 90.0),
		bool(context.get(action + "/invert x")),
		bool(context.get(action + "/invert y")),
		int(clamp(8 if samples is None else samples, 1, 64)),
	)


def axes(context, action: str):
	# (x, y) of the stick, -100..100, and the levels read — None when a pin
	# is missing or shared (the action then goes out Fallback). A stick held
	# pushed at the first run still reads: see center(). Wiring that keeps an
	# axis at an end of the scale (no attenuation, VCC at 5 V, a loose wire)
	# reads as pushed all the time — raw_x/raw_y show it.
	x_pin = context.get(action + "/x pin")
	y_pin = context.get(action + "/y pin")
	if x_pin is None or y_pin is None or x_pin == y_pin:
		return None
	dead_zone, invert_x, invert_y, samples = options(context, action)

	rest_x, rest_y = center(x_pin, samples), center(y_pin, samples)
	raw_x, raw_y = level(x_pin, samples), level(y_pin, samples)
	x = position(raw_x, rest_x, dead_zone, invert_x)
	# VRy reads lower as the stick goes up (KY-023 and most modules): up is
	# positive once it's flipped — Invert Y flips it back for one that doesn't.
	y = position(raw_y, rest_y, dead_zone, not invert_y)
	return x, y, raw_x, raw_y
