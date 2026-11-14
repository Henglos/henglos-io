# The DHT component (packages/library/components/DHT), with a simulated
# sensor: MicroPython's `dht` driver, faked — `_Sensor.reading` is what it
# measures, `_Sensor.fails` how many measure() calls time out first.

import asyncio
import importlib
import os
import struct
import sys
import types

import pytest

from henglosio.sdk import SUCCESS, FALLBACK, generate_id
from hio.system.core.Context import ActionContext, PipelineContext, TriggerContext
from hio.system.core.services.PacketCodec import Config, DataType


class _Sensor:
	reading = (25.0, 60.0)
	fails = 0
	measures = 0

	def __init__(self, pin) -> None:
		pass

	def measure(self) -> None:
		_Sensor.measures += 1
		if _Sensor.fails:
			_Sensor.fails -= 1
			raise OSError(116)              # ETIMEDOUT, as the driver raises it

	def temperature(self):
		return _Sensor.reading[0]

	def humidity(self):
		return _Sensor.reading[1]


_dht = types.ModuleType("dht")
_dht.DHT11 = _Sensor
_dht.DHT22 = _Sensor
sys.modules.setdefault("dht", _dht)

_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "library", "components", "DHT", "src")
if "dht_component" not in sys.modules:
	package = types.ModuleType("dht_component")
	package.__path__ = [os.path.abspath(_SRC)]
	sys.modules["dht_component"] = package

sensor = importlib.import_module("dht_component.sensor")
read = importlib.import_module("dht_component.read")
climate_trigger = importlib.import_module("dht_component.climate_trigger")

_PIN = 4


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
	monkeypatch.setitem(sys.modules, "dht", _dht)
	sensor._sensors.clear()
	sensor._last.clear()
	_Sensor.reading, _Sensor.fails, _Sensor.measures = (25.0, 60.0), 0, 0
	yield


def _pin(name: str) -> Config:
	return Config(generate_id(name), DataType.INTEGER, struct.pack("<i", _PIN))


def _text(name: str, value: str) -> Config:
	return Config(generate_id(name), DataType.STRING, value.encode())


def _number(name: str, value: float) -> Config:
	return Config(generate_id(name), DataType.FLOAT, struct.pack("<f", value))


def _read(*configs):
	pipeline = PipelineContext(16)
	pipeline.merge(_pin("read/data pin"))
	for config in configs:
		pipeline.merge(config)
	context = ActionContext(pipeline, {})
	output = asyncio.run(read.ReadAction().execute(context))
	values = {}
	for config in context.results:
		data = bytes(config.data)
		values[config.config_id] = struct.unpack("<f", data)[0] if config.data_type == DataType.FLOAT else data
	return output, values


def test_read_gives_temperature_humidity_and_what_follows_from_them():
	output, values = _read()
	assert output == SUCCESS
	assert values[generate_id("temperature")] == pytest.approx(25.0)
	assert values[generate_id("humidity")] == pytest.approx(60.0)
	assert values[generate_id("dew_point")] == pytest.approx(16.7, abs=0.1)     # Magnus, 25 °C / 60 %
	assert values[generate_id("heat_index")] == pytest.approx(25.2, abs=0.3)


def test_read_in_fahrenheit():
	_, values = _read(_text("read/unit", "fahrenheit"))
	assert values[generate_id("temperature")] == pytest.approx(77.0)


def test_a_missed_reading_is_asked_again(monkeypatch):
	_Sensor.fails = 1
	async def no_wait(ms):
		return None
	monkeypatch.setattr(read, "sleep_ms", no_wait)
	output, _ = _read()
	assert output == SUCCESS
	assert _Sensor.measures == 2


def test_a_sensor_that_never_answers_goes_out_fallback(monkeypatch):
	_Sensor.fails = 99
	async def no_wait(ms):
		return None
	monkeypatch.setattr(read, "sleep_ms", no_wait)
	output, values = _read()
	assert output == FALLBACK
	assert values[generate_id("error")] == b"no_answer"


def test_asked_again_too_soon_it_gives_back_the_last_reading():
	_read()
	_Sensor.reading = (99.0, 99.0)
	_, values = _read()
	assert _Sensor.measures == 1
	assert values[generate_id("temperature")] == pytest.approx(25.0)


def _armed(*configs):
	context = TriggerContext([_pin("climate trigger/data pin"), *configs])
	trigger = climate_trigger.ClimateTrigger()
	trigger.arm(context)
	return trigger, context


def _next(trigger, context, reading):
	# The sensor's next reading, Interval later.
	_Sensor.reading = reading
	sensor._last.clear()
	if trigger.last is not None:
		trigger.last -= trigger.interval
	return trigger.poll(context)


def test_the_trigger_fires_going_above_limit_once_until_it_comes_back():
	trigger, context = _armed(_number("climate trigger/limit", 30), _number("climate trigger/hysteresis", 1))
	assert _next(trigger, context, (25.0, 50.0)) is False
	assert _next(trigger, context, (31.0, 50.0)) is True
	assert _next(trigger, context, (31.5, 50.0)) is False          # still above: not again
	assert _next(trigger, context, (29.5, 50.0)) is False          # back, but not past Hysteresis
	assert _next(trigger, context, (30.5, 50.0)) is False
	assert _next(trigger, context, (28.5, 50.0)) is False          # past Hysteresis: reset
	assert _next(trigger, context, (30.5, 50.0)) is True


def test_the_trigger_watches_humidity_going_below():
	trigger, context = _armed(_text("climate trigger/watch", "humidity"), _text("climate trigger/when", "below"), _number("climate trigger/limit", 40))
	assert _next(trigger, context, (25.0, 55.0)) is False
	assert _next(trigger, context, (25.0, 35.0)) is True


def test_the_trigger_waits_for_interval():
	trigger, context = _armed(_number("climate trigger/limit", 30))
	assert trigger.poll(context) is False
	_Sensor.reading = (35.0, 50.0)
	assert trigger.poll(context) is False                           # inside Interval: not even read
	assert _Sensor.measures == 1
