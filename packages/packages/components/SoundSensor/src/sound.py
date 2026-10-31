from machine import ADC, Pin

from hio.sdk import ticks_ms, ticks_diff


# What the Sound Sensor actions share — a microphone module with a
# comparator (KY-037 / KY-038 and the like: AO, DO, +, G).
#
# AO is the microphone's signal: a voltage sitting mid-scale that swings
# with the sound. How loud is how far it swings — its peak-to-peak over a
# short Window — as `level`, 0..100 % of Full Scale. A single reading says
# nothing (it's somewhere on the wave), so it's always a window.
#
# DO is the module's own comparator: it flips when the sound passes the
# threshold set on its trimpot — instant, so short sounds (a clap) aren't
# missed between two windows. Which level means "sound" depends on the
# module (Active).

FULL = 65535
_WARM_UP = 4

_adcs = {}                  # analog pin -> ADC
_inputs = {}                # digital pin -> Pin


def text(value, default: str) -> str:
	# An options config arrives as bytes (its text).
	return bytes(value).decode() if value is not None else default


def number(value, default):
	return default if value is None else value


def adc(pin: int) -> ADC:
	# The full 0-3.3 V range (11 dB): AO rests around half the supply.
	found = _adcs.get(pin)
	if found is None:
		try:
			found = ADC(Pin(pin), atten=ADC.ATTN_11DB)
		except (TypeError, AttributeError, ValueError):
			found = ADC(Pin(pin))
			try:
				found.atten(ADC.ATTN_11DB)
			except (AttributeError, ValueError):
				pass
		for _ in range(_WARM_UP):
			found.read_u16()
		_adcs[pin] = found
	return found


def peak_to_peak(pin: int, window_ms: int) -> int:
	# How far AO swung over `window_ms` — 0 in silence, more the louder.
	# read_u16 (not read_uv): fast, and only the swing matters, not the volts.
	reader = adc(pin)
	low, high = FULL, 0
	start = ticks_ms()
	while True:
		value = reader.read_u16()
		if value < low:
			low = value
		if value > high:
			high = value
		if ticks_diff(ticks_ms(), start) >= window_ms:
			break
	return high - low if high >= low else 0


def level(swing: int, full_scale) -> float:
	# The swing as 0..100 % of Full Scale (the swing that counts as 100 %).
	full = max(1, int(full_scale))
	percent = swing * 100 / full
	return 100.0 if percent > 100 else percent


def digital(pin: int) -> Pin:
	found = _inputs.get(pin)
	if found is None:
		found = Pin(pin, Pin.IN)
		_inputs[pin] = found
	return found


def active_level(value) -> int:
	# Which DO level means sound — High on most modules (the LED on).
	return 0 if text(value, "high") == "low" else 1


def heard(pin: int, active: int) -> bool:
	return digital(pin).value() == active


def listen(context, prefix: str):
	# What the action's pins say now: (level %, swing, loud, DO) — level and
	# swing None without an Analog Pin, DO None without a Digital Pin; None
	# altogether without either.
	analog = context.get(prefix + "/analog pin")
	pin = context.get(prefix + "/digital pin")
	if analog is None and pin is None:
		return None

	percent = swing = None
	loud = False
	if analog is not None:
		swing = peak_to_peak(analog, int(number(context.get(prefix + "/window"), 50)))
		percent = level(swing, number(context.get(prefix + "/full scale"), 16384))
		loud = percent >= number(context.get(prefix + "/threshold"), 30)

	detected = None
	if pin is not None:
		detected = heard(pin, active_level(context.get(prefix + "/active")))
		loud = loud or detected

	return percent, swing, loud, detected


def publish(context, found) -> None:
	percent, swing, loud, detected = found
	if percent is not None:
		context.set("level", percent)
		context.set("peak", swing)
	if detected is not None:
		context.set("detected", detected)
	context.set("loud", loud)
