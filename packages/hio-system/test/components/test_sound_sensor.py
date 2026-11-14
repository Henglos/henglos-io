# The Sound Sensor component (packages/library/components/SoundSensor),
# with a simulated microphone: `_Mic.wave` is what AO reads, sample after
# sample (round and round), and DO is the conftest's simulated Pin.

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


class _Mic:
	ATTN_11DB = 3
	wave = [32768]

	def __init__(self, pin, atten=None) -> None:
		self.index = 0

	def read_u16(self) -> int:
		value = _Mic.wave[self.index % len(_Mic.wave)]
		self.index += 1
		return value


machine = sys.modules["machine"]
if not hasattr(machine, "ADC"):
	machine.ADC = _Mic

_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "library", "components", "SoundSensor", "src")
if "sound_component" not in sys.modules:
	package = types.ModuleType("sound_component")
	package.__path__ = [os.path.abspath(_SRC)]
	sys.modules["sound_component"] = package

sound = importlib.import_module("sound_component.sound")
read = importlib.import_module("sound_component.read")
detect = importlib.import_module("sound_component.detect")
sound_trigger = importlib.import_module("sound_component.sound_trigger")

_AO, _DO = 39, 27
_Pin = machine.Pin


@pytest.fixture(autouse=True)
def board(monkeypatch):
	monkeypatch.setattr(sound, "adc", lambda pin: _Mic(pin))
	sound._inputs.clear()
	_Pin.reset()
	_Pin.irqs.clear()
	_Mic.wave = [32768]
	yield


def _pin(name: str, gpio: int) -> Config:
	return Config(generate_id(name), DataType.INTEGER, struct.pack("<i", gpio))


def _number(name: str, value: float) -> Config:
	return Config(generate_id(name), DataType.FLOAT, struct.pack("<f", value))


def _run(action, *configs):
	pipeline = PipelineContext(16)
	for config in configs:
		pipeline.merge(config)
	context = ActionContext(pipeline, {})
	output = asyncio.run(action.execute(context))
	values = {}
	for config in context.results:
		data = bytes(config.data)
		values[config.config_id] = (
			struct.unpack("<f", data)[0] if config.data_type == DataType.FLOAT
			else data == b"\x01" if config.data_type == DataType.BOOL
			else struct.unpack("<i", data)[0] if config.data_type == DataType.INTEGER
			else data
		)
	return output, values


def test_silence_reads_quiet():
	output, values = _run(read.ReadAction(), _pin("read/analog pin", _AO), _number("read/window", 5))
	assert output == SUCCESS
	assert values[generate_id("peak")] == 0
	assert values[generate_id("level")] == pytest.approx(0)
	assert values[generate_id("loud")] is False


def test_a_swing_is_how_loud():
	_Mic.wave = [32768 - 4096, 32768 + 4096]      # 8192 peak to peak: half of Full Scale
	_, values = _run(read.ReadAction(), _pin("read/analog pin", _AO), _number("read/window", 5))
	assert values[generate_id("peak")] == 8192
	assert values[generate_id("level")] == pytest.approx(50)
	assert values[generate_id("loud")] is True


def test_detect_branches_on_do_alone():
	_Pin.levels[_DO] = 1
	assert _run(detect.DetectAction(), _pin("detect/digital pin", _DO))[0] == "loud"
	_Pin.levels[_DO] = 0
	assert _run(detect.DetectAction(), _pin("detect/digital pin", _DO))[0] == "quiet"


def test_no_pin_goes_out_fallback():
	output, values = _run(read.ReadAction())
	assert output == FALLBACK
	assert values[generate_id("error")] == b"no_pin"


def test_the_trigger_catches_do_and_cools_down():
	context = TriggerContext([_pin("sound trigger/digital pin", _DO), _number("sound trigger/cooldown", 300)])
	trigger = sound_trigger.SoundTrigger()
	trigger.initialize()
	trigger.arm(context)
	assert trigger.poll(context) is False

	_Pin.edge(_DO, 1)                             # a clap: DO flips
	assert trigger.poll(context) is True
	_Pin.edge(_DO, 1)                             # its echo, right after
	assert trigger.poll(context) is False

	trigger.fired -= 400                          # Cooldown gone by
	_Pin.edge(_DO, 1)
	assert trigger.poll(context) is True

	trigger.disarm()
	assert _DO not in _Pin.irqs


def test_the_trigger_listens_on_ao_without_do():
	context = TriggerContext([_pin("sound trigger/analog pin", _AO), _number("sound trigger/window", 2), _number("sound trigger/interval", 10)])
	trigger = sound_trigger.SoundTrigger()
	trigger.initialize()
	trigger.arm(context)
	assert trigger.poll(context) is False         # silence
	trigger.read -= 20
	_Mic.wave = [16384, 49152]                    # a loud swing
	assert trigger.poll(context) is True
