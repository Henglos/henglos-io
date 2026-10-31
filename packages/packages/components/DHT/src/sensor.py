import math

from machine import Pin

from hio.sdk import ticks_ms, ticks_diff


# What the DHT actions share — a DHT11 or DHT22 (AM2302) on one data pin,
# through MicroPython's own `dht` driver: one transaction gives both the
# temperature and the humidity.
#
# The sensor takes so many readings: a DHT11 one a second, a DHT22 one every
# 2 s — asked sooner, it doesn't answer. So the last reading is kept per pin:
# asked again within that time (Read and a Climate Trigger on the same pin,
# a fast loop), it's what comes back, instead of a failed read.

# Model -> (driver class name, the least time between two readings in ms)
_MODELS = {
	"dht11": ("DHT11", 1000),
	"dht22": ("DHT22", 2000),
}

_sensors = {}               # (pin, model) -> driver
_last = {}                  # pin -> (when, temperature °C, humidity %)


def text(value, default: str) -> str:
	# An options config arrives as bytes (its text).
	return bytes(value).decode() if value is not None else default


def model_of(value) -> str:
	model = text(value, "dht11").lower()
	return model if model in _MODELS else "dht11"


def min_interval(model: str) -> int:
	return _MODELS[model][1]


def _driver(pin: int, model: str):
	key = (pin, model)
	found = _sensors.get(key)
	if found is None:
		import dht
		found = getattr(dht, _MODELS[model][0])(Pin(pin))
		_sensors[key] = found
	return found


def cached(pin: int, model: str):
	# The last reading, while it's still the sensor's newest — None past that.
	last = _last.get(pin)
	if last is None or ticks_diff(ticks_ms(), last[0]) >= min_interval(model):
		return None
	return last[1], last[2]


def measure(pin: int, model: str):
	# (temperature °C, humidity %) — the kept reading while the sensor can't
	# take a new one yet. Raises OSError when it doesn't answer.
	kept = cached(pin, model)
	if kept is not None:
		return kept
	sensor = _driver(pin, model)
	sensor.measure()
	temperature, humidity = float(sensor.temperature()), float(sensor.humidity())
	_last[pin] = (ticks_ms(), temperature, humidity)
	return temperature, humidity


def to_unit(celsius: float, unit: str) -> float:
	return celsius * 9 / 5 + 32 if unit == "fahrenheit" else celsius


def dew_point(celsius: float, humidity: float) -> float:
	# Magnus' formula — the temperature the air would fog at, in °C.
	if humidity <= 0:
		return float("nan")
	a, b = 17.62, 243.12
	gamma = math.log(humidity / 100) + a * celsius / (b + celsius)
	return b * gamma / (a - gamma)


def heat_index(celsius: float, humidity: float) -> float:
	# How hot it feels, in °C — NOAA's (Rothfusz's regression, Steadman's
	# below 80 °F, where humidity barely counts).
	f = celsius * 9 / 5 + 32
	simple = 0.5 * (f + 61.0 + (f - 68.0) * 1.2 + humidity * 0.094)
	if (simple + f) / 2 < 80:
		result = simple
	else:
		result = (-42.379 + 2.04901523 * f + 10.14333127 * humidity - 0.22475541 * f * humidity
			- 0.00683783 * f * f - 0.05481717 * humidity * humidity + 0.00122874 * f * f * humidity
			+ 0.00085282 * f * humidity * humidity - 0.00000199 * f * f * humidity * humidity)
		if humidity < 13 and 80 <= f <= 112:
			result -= ((13 - humidity) / 4) * math.sqrt((17 - abs(f - 95)) / 17)
		elif humidity > 85 and 80 <= f <= 87:
			result += ((humidity - 85) / 10) * ((87 - f) / 5)
	return (result - 32) * 5 / 9


def publish(context, celsius: float, humidity: float, unit: str) -> None:
	# The reading, in `unit` — and what it feels like, and where it fogs.
	context.set("temperature", round(to_unit(celsius, unit), 1))
	context.set("humidity", round(humidity, 1))
	context.set("heat_index", round(to_unit(heat_index(celsius, humidity), unit), 1))
	dew = dew_point(celsius, humidity)
	if dew == dew:                  # not NaN (0 % humidity has none)
		context.set("dew_point", round(to_unit(dew, unit), 1))
