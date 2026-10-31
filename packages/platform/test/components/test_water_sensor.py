# The Water Sensor component (packages/packages/components/WaterSensor), with
# a simulated ADC: `_Adc.level` is the voltage on its pin, 0..65535.

import asyncio
import importlib
import os
import struct
import sys
import types

import pytest

from hio.sdk import SUCCESS, FALLBACK, generate_id
from hio.system.core.Context import ActionContext, PipelineContext, TriggerContext
from hio.system.core.services.PacketCodec import Config, DataType


class _Adc:
	ATTN_11DB = 3
	levels = {}                     # pin -> level

	def __init__(self, pin, atten=None) -> None:
		self.pin = getattr(pin, "id", pin)

	def read_u16(self) -> int:
		return _Adc.levels.get(self.pin, 0)


machine = sys.modules["machine"]
if not hasattr(machine, "ADC"):
	machine.ADC = _Adc

_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "packages", "components", "WaterSensor", "src")
if "water_component" not in sys.modules:
	package = types.ModuleType("water_component")
	package.__path__ = [os.path.abspath(_SRC)]
	sys.modules["water_component"] = package

water = importlib.import_module("water_component.water")
read = importlib.import_module("water_component.read")
detect = importlib.import_module("water_component.detect")
calibrate = importlib.import_module("water_component.calibrate")
water_trigger = importlib.import_module("water_component.water_trigger")

_SIGNAL = 36


@pytest.fixture(autouse=True)
def board(monkeypatch, tmp_path):
	monkeypatch.setattr(water, "ADC", _Adc)
	# The pin's number, whatever the Pin stub keeps.
	monkeypatch.setattr(water, "adc", lambda pin: _Adc(pin))
	monkeypatch.setattr(water, "CALIBRATION_FILE", str(tmp_path / "data" / "water_sensor.json").replace("\\", "/"))
	monkeypatch.setattr(water, "_calibration", None)
	_Adc.levels.clear()
	yield


def _pin(name: str, gpio: int) -> Config:
	return Config(generate_id(name), DataType.UINT_8, bytes([gpio]))


def _number(name: str, value: float) -> Config:
	return Config(generate_id(name), DataType.FLOAT_32, struct.pack("<f", value))


def _text(name: str, value: str) -> Config:
	return Config(generate_id(name), DataType.UINT_8, value.encode(), True)


def _run(action, prefix: str, *configs):
	pipeline = PipelineContext(16)
	pipeline.merge(_pin(prefix + "/signal pin", _SIGNAL))
	for config in configs:
		pipeline.merge(config)
	context = ActionContext(pipeline, {})
	output = asyncio.run(action.execute(context))
	return output, {config.config_id: config for config in context.results}


def _value(results, name):
	config = results[generate_id(name)]
	if config.data_type == DataType.FLOAT_32:
		return struct.unpack("<f", bytes(config.data))[0]
	if config.data_type == DataType.BOOL:
		return bytes(config.data) == b"\x01"
	return struct.unpack("<i", bytes(config.data))[0]


def test_read_gives_the_level_between_dry_and_wet():
	_Adc.levels[_SIGNAL] = 17500                     # halfway to the default Wet (35000)
	output, results = _run(read.ReadAction(), "read")
	assert output == SUCCESS
	assert _value(results, "level") == pytest.approx(50, abs=0.1)
	assert _value(results, "wet") is True
	assert _value(results, "raw") == 17500


def test_detect_branches_wet_or_dry_by_threshold():
	_Adc.levels[_SIGNAL] = 1000
	assert _run(detect.DetectAction(), "detect", _number("detect/threshold", 10))[0] == "dry"
	_Adc.levels[_SIGNAL] = 10000
	assert _run(detect.DetectAction(), "detect", _number("detect/threshold", 10))[0] == "wet"


def test_calibrate_sets_what_read_measures_against():
	_Adc.levels[_SIGNAL] = 2000
	assert _run(calibrate.CalibrateAction(), "calibrate", _text("calibrate/point", "dry"))[0] == SUCCESS
	_Adc.levels[_SIGNAL] = 22000
	_, results = _run(calibrate.CalibrateAction(), "calibrate", _text("calibrate/point", "wet"))
	assert (_value(results, "dry"), _value(results, "wet")) == (2000, 22000)

	_Adc.levels[_SIGNAL] = 12000
	_, results = _run(read.ReadAction(), "read")
	assert _value(results, "level") == pytest.approx(50, abs=0.1)


def test_calibration_outlives_the_session_that_took_it():
	# A new session loads the components afresh: the levels come back from the file.
	_Adc.levels[_SIGNAL] = 2819
	_run(calibrate.CalibrateAction(), "calibrate", _text("calibrate/point", "dry"))
	water._calibration = None                        # this module's memory, gone

	_, results = _run(read.ReadAction(), "read")
	assert _value(results, "level") == pytest.approx(0)
	assert _value(results, "wet") is False


def test_no_signal_pin_goes_out_fallback():
	context = ActionContext(PipelineContext(4), {})
	assert asyncio.run(read.ReadAction().execute(context)) == FALLBACK


def test_the_trigger_fires_on_getting_wet_once():
	configs = [_pin("water trigger/signal pin", _SIGNAL), _number("water trigger/interval", 50), _text("water trigger/fires on", "wet")]
	context = TriggerContext(configs)
	trigger = water_trigger.WaterTrigger()
	trigger.arm(context)

	_Adc.levels[_SIGNAL] = 0
	assert trigger.poll(context) is False             # dry from the start: nothing
	trigger.last -= 100                               # Interval gone by
	_Adc.levels[_SIGNAL] = 30000
	assert trigger.poll(context) is True              # got wet
	assert any(result.config_id == generate_id("level") for result in context.results)
	trigger.last -= 100
	assert trigger.poll(context) is False             # still wet: not again
	assert trigger.poll(context) is False             # inside Interval: not even read


def test_the_trigger_counts_wet_at_arming_as_getting_wet():
	_Adc.levels[_SIGNAL] = 30000
	context = TriggerContext([_pin("water trigger/signal pin", _SIGNAL)])
	trigger = water_trigger.WaterTrigger()
	trigger.arm(context)
	assert trigger.poll(context) is True
