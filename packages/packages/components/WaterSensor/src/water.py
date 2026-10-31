import json
import time

from machine import ADC, Pin


# What the Water Sensor actions share — the analog water level module (S, +,
# -) and the like: parallel traces that conduct more the more of them is
# under water, read by the ADC on Signal.
#
# Readings are raw levels, 0..65535 for 0..3.3 V; `level` is where a reading
# sits between the sensor's Dry and Wet raw levels, 0..100 %. Calibrate
# measures those two on the sensor itself, per Signal pin, into a file on the
# board (CALIBRATION_FILE) — not this module's memory: every session (a ▶, a
# Debug, a Play) loads the components afresh, and a restart clears RAM. Until
# it ran, the Dry Level / Wet Level configs say them.
#
# Power Pin (optional): the sensor's + wired to a digital pin, switched on only
# while reading — a sensor powered all the time corrodes its traces in weeks.

FULL = 65535
_VREF_UV = 3_300_000        # the sensor's supply, what FULL stands for
_SETTLE_MS = 10             # after powering it, before reading
_WARM_UP = 4                # conversions dropped after setting a channel up

_adcs = {}                  # signal pin -> ADC
_powers = {}                # power pin -> Pin
# Where Calibrate keeps its levels: {"<signal pin>": {"dry": level, "wet": level}}.
# Outside what the driver manages (/components, /files, /secrets): it stays.
CALIBRATION_FILE = "/data/water_sensor.json"

_calibration = None         # signal pin -> {"dry": level, "wet": level} — read from the file once


def _sleep_ms(ms: int) -> None:
	try:
		time.sleep_ms(ms)
	except AttributeError:
		time.sleep(ms / 1000)       # CPython (tests)


def adc(pin: int) -> ADC:
	# The full 0-3.3 V range: without the 11 dB attenuation an ESP32 reads only up to ~1.1 V.
	found = _adcs.get(pin)
	if found is None:
		try:
			found = ADC(Pin(pin), atten=ADC.ATTN_11DB)
		except (TypeError, AttributeError, ValueError):
			found = ADC(Pin(pin))
			try:
				found.atten(ADC.ATTN_11DB)
			except (AttributeError, ValueError):
				pass                    # a port without attenuation: its full range already
		for _ in range(_WARM_UP):
			found.read_u16()
		_adcs[pin] = found
	return found


def _one(reader) -> int:
	# The calibrated voltage where the port has it (read_u16 isn't linear at 11 dB), else read_u16().
	try:
		return min(FULL, reader.read_uv() * FULL // _VREF_UV)
	except AttributeError:
		return reader.read_u16()


def _power(pin):
	if pin is None:
		return None
	found = _powers.get(pin)
	if found is None:
		found = Pin(pin, Pin.OUT)
		found.value(0)
		_powers[pin] = found
	return found


def raw(signal: int, power=None, samples=8) -> int:
	# One reading, averaged over `samples` (the ADC is noisy) — the sensor
	# powered just for it when it has a Power Pin.
	supply = _power(power)
	if supply is not None:
		supply.value(1)
		_sleep_ms(_SETTLE_MS)
	try:
		reader = adc(signal)
		count = max(1, int(samples))
		return sum(_one(reader) for _ in range(count)) // count
	finally:
		if supply is not None:
			supply.value(0)


def _levels() -> dict:
	# The calibration file, read once per load of this module (empty without one).
	global _calibration
	if _calibration is None:
		try:
			with open(CALIBRATION_FILE) as file:
				stored = json.load(file)
			_calibration = {int(pin): levels for pin, levels in stored.items() if isinstance(levels, dict)}
		except (OSError, ValueError):
			_calibration = {}
	return _calibration


def _save() -> None:
	folder = CALIBRATION_FILE.rsplit("/", 1)[0]
	try:
		import os
		os.mkdir(folder)
	except OSError:
		pass                        # there already
	with open(CALIBRATION_FILE, "w") as file:
		json.dump({str(pin): levels for pin, levels in _levels().items()}, file)


def bounds(context, prefix: str, signal: int):
	# (dry, wet) raw levels: Calibrate's on this pin, else the configs'.
	measured = _levels().get(signal, {})
	dry = measured.get("dry", _number(context.get(prefix + "/dry level"), 0))
	wet = measured.get("wet", _number(context.get(prefix + "/wet level"), 35000))
	return int(dry), int(wet)


def level(value: int, dry: int, wet: int) -> float:
	# Where `value` sits from dry (0 %) to wet (100 %) — clamped.
	if wet == dry:
		return 100.0 if value >= wet else 0.0
	percent = (value - dry) * 100 / (wet - dry)
	return 0.0 if percent < 0 else 100.0 if percent > 100 else percent


def calibrate(signal: int, point: str, value: int) -> dict:
	# Kept in the file — the next session (and a restart) reads it back.
	measured = _levels().setdefault(signal, {})
	measured[point] = value
	_save()
	return measured


def measure(context, prefix: str):
	# (raw, level %, whether it's wet) per the action's configs — None without a Signal Pin.
	signal = context.get(prefix + "/signal pin")
	if signal is None:
		return None
	value = raw(signal, context.get(prefix + "/power pin"), _number(context.get(prefix + "/samples"), 8))
	dry, wet = bounds(context, prefix, signal)
	percent = level(value, dry, wet)
	return value, percent, percent >= _number(context.get(prefix + "/threshold"), 10)


def text(value, default: str) -> str:
	# An options config arrives as bytes (its text).
	return bytes(value).decode() if value is not None else default


def _number(value, default):
	return default if value is None else value
