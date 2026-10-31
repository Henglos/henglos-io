from machine import Pin, PWM


# What the PWM actions share: one PWM per pin, created on first use and kept
# — recreating it fails on MicroPython's ESP32 port ("PWM is inactive") and
# glitches the output — plus the duty each pin was last set to, so a Fade
# can start from wherever the pin is.
#
# Duty is a percentage (0-100) everywhere here; the hardware takes duty_u16.

DEFAULT_FREQUENCY = 1000
# ESP32's LEDC goes from 1 Hz to 40 MHz, but past ~40 kHz the duty loses
# resolution; nothing here needs more.
MIN_FREQUENCY = 1
MAX_FREQUENCY = 40000

# Perceived brightness: the eye sees light on a curve, so a linear duty makes
# a LED jump near 0 and barely change near 100. Duty ^ gamma evens it out.
_GAMMA = 2.2

_pwms = {}      # pin -> PWM
_duties = {}    # pin -> the duty it was last set to (%), before scale/invert


def clamp(value: float, low: float, high: float) -> float:
	return low if value < low else high if value > high else value


def frequency(value) -> int:
	# A number config's Frequency (Hz), clamped — the default when unset.
	return DEFAULT_FREQUENCY if value is None else int(clamp(round(value), MIN_FREQUENCY, MAX_FREQUENCY))


def text(value, default: str) -> str:
	# An options config arrives as bytes (its value's text).
	return bytes(value).decode() if value is not None else default


def output(duty: float, scale: str, invert: bool) -> int:
	# The duty_u16 the pin gets for `duty` %: on the perceived-brightness
	# curve or not, and inverted for an active-low load (a LED to 3.3 V).
	fraction = clamp(duty, 0, 100) / 100
	if scale == "perceived":
		fraction = fraction ** _GAMMA
	if invert:
		fraction = 1 - fraction
	return round(fraction * 65535)


def pwm_on(pin: int, hz: int) -> PWM:
	# `pin`'s PWM at `hz`. A new one starts at duty 0.
	pwm = _pwms.get(pin)
	if pwm is None:
		pwm = PWM(Pin(pin), freq=hz, duty_u16=0)
		_pwms[pin] = pwm
	elif pwm.freq() != hz:
		pwm.freq(hz)
	return pwm


def set_duty(pin: int, hz: int, duty: float, scale: str, invert: bool) -> None:
	pwm_on(pin, hz).duty_u16(output(duty, scale, invert))
	_duties[pin] = clamp(duty, 0, 100)


def last_duty(pin: int) -> float:
	# Where the pin is, in % — 0 when nothing set it yet (or it was stopped).
	return _duties.get(pin, 0.0)


def stop(pin: int, hold_low: bool) -> None:
	# Stops `pin`'s signal and frees it. With `hold_low`, the pin is then
	# driven LOW — a load on it stays off instead of floating.
	pwm = _pwms.pop(pin, None)
	_duties.pop(pin, None)
	if pwm is not None:
		pwm.deinit()
	if hold_low:
		Pin(pin, Pin.OUT).value(0)
