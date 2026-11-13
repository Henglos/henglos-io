# The Servo component's actions (packages/library/components/Servo), loaded
# the way the board would — by importing their source, which registers them —
# against the simulated machine.PWM from conftest.

import asyncio
import importlib
import os
import struct
import sys
import types

import pytest
from machine import PWM

from support import Host, execute_frame

from hio.sdk import SUCCESS, FALLBACK, generate_id
from hio.sdk.core import registry
from hio.system.core.Context import ActionContext, PipelineContext
from hio.system.core.services.PacketCodec import CommandId, OutputId, Config, DataType

_SERVO = os.path.join(
	os.path.dirname(os.path.abspath(__file__)),
	"..", "..", "..", "library", "components", "Servo", "src",
)


# As a package, the way the board imports a component (components.servo.*) —
# the actions reach driver.py with a relative import.
_PACKAGE = "hio_test_servo"
_package = types.ModuleType(_PACKAGE)
_package.__path__ = [_SERVO]
sys.modules[_PACKAGE] = _package

to_angle = importlib.import_module(_PACKAGE + ".to_angle")
rotate = importlib.import_module(_PACKAGE + ".rotate")
release = importlib.import_module(_PACKAGE + ".release")
driver = importlib.import_module(_PACKAGE + ".driver")


def _pin(name: str, number: int) -> Config:
	return Config(generate_id(name), DataType.INTEGER, struct.pack("<i", number))


def _number(name: str, value: float) -> Config:
	return Config(generate_id(name), DataType.FLOAT, struct.pack("<f", value))


def _text(name: str, value: str) -> Config:
	return Config(generate_id(name), DataType.STRING, value.encode())


def _run(action_class, *configs):
	pipeline = PipelineContext(16)
	for config in configs:
		pipeline.merge(config)
	context = ActionContext(pipeline, {})
	action = action_class()
	action.initialize()
	action.context = context
	return asyncio.run(action.execute(context)), context


def _published(context: ActionContext, name: str) -> int:
	for config in context.results:
		if config.config_id == generate_id(name):
			return struct.unpack("<i", config.data)[0]
	raise KeyError(name)


def _pulse_us(pin: int) -> float:
	signal = PWM.signals[pin]
	assert signal["freq"] == 50
	return signal["duty_ns"] / 1000


@pytest.fixture(autouse=True)
def board():
	# The simulated board and the driver's PWM-per-pin table start empty.
	PWM.reset()
	driver._pwms.clear()
	yield
	PWM.reset()
	driver._pwms.clear()


# --- registration

def test_actions_register_under_their_wire_ids():
	assert registry.find(generate_id("servo/to angle")) is to_angle.ToAngleAction
	assert registry.find(generate_id("servo/rotate")) is rotate.RotateAction
	assert registry.find(generate_id("servo/release")) is release.ReleaseAction


# --- To Angle (positional, 0-180°)

@pytest.mark.parametrize("angle, pulse", [(0, 500), (90, 1500), (180, 2500), (45, 1000)])
def test_to_angle_maps_the_angle_onto_the_pulse(angle, pulse):
	output, context = _run(to_angle.ToAngleAction, _pin("to angle/signal pin", 18), _number("to angle/angle", angle))

	assert output == SUCCESS
	assert _pulse_us(18) == pulse
	assert _published(context, "angle") == angle


@pytest.mark.parametrize("angle, clamped, pulse", [(-30, 0, 500), (250, 180, 2500)])
def test_to_angle_clamps_to_0_180(angle, clamped, pulse):
	output, context = _run(to_angle.ToAngleAction, _pin("to angle/signal pin", 18), _number("to angle/angle", angle))

	assert output == SUCCESS
	assert _pulse_us(18) == pulse
	assert _published(context, "angle") == clamped


def test_to_angle_uses_the_calibrated_pulses():
	_run(to_angle.ToAngleAction,
		_pin("to angle/signal pin", 18), _number("to angle/angle", 90),
		_number("to angle/min pulse", 1000), _number("to angle/max pulse", 2000))

	assert _pulse_us(18) == 1500


@pytest.mark.parametrize("configs", [
	(_number("to angle/angle", 90),),                                                        # no pin
	(_pin("to angle/signal pin", 18),),                                                      # no angle
	(_pin("to angle/signal pin", 18), _number("to angle/angle", 90),
		_number("to angle/min pulse", 2000), _number("to angle/max pulse", 1000)),          # min >= max
])
def test_to_angle_with_bad_configs_is_fallback(configs):
	output, _ = _run(to_angle.ToAngleAction, *configs)
	assert output == FALLBACK
	assert PWM.signals == {}


# --- Rotate (continuous, 360°)

@pytest.mark.parametrize("speed, direction, pulse", [
	(0, "clockwise", 1500),                 # stopped
	(100, "clockwise", 2000),               # full speed one way
	(100, "counterclockwise", 1000),        # full speed the other
	(50, "counterclockwise", 1250),
])
def test_rotate_maps_speed_and_direction_onto_the_pulse(speed, direction, pulse):
	output, context = _run(rotate.RotateAction,
		_pin("rotate/signal pin", 19), _number("rotate/speed", speed), _text("rotate/direction", direction))

	assert output == SUCCESS
	assert _pulse_us(19) == pulse
	assert _published(context, "speed") == speed


def test_rotate_clamps_the_speed():
	output, context = _run(rotate.RotateAction, _pin("rotate/signal pin", 19), _number("rotate/speed", 300))
	assert output == SUCCESS
	assert _pulse_us(19) == 2000
	assert _published(context, "speed") == 100


def test_rotate_stops_at_the_calibrated_stop_pulse():
	# A unit that creeps at 1500 µs, trimmed to stand still at 1520.
	_run(rotate.RotateAction,
		_pin("rotate/signal pin", 19), _number("rotate/speed", 0),
		_number("rotate/stop pulse", 1520), _number("rotate/range", 400))
	assert _pulse_us(19) == 1520

	_run(rotate.RotateAction,
		_pin("rotate/signal pin", 19), _number("rotate/speed", 100),
		_number("rotate/stop pulse", 1520), _number("rotate/range", 400))
	assert _pulse_us(19) == 1920


def test_rotate_without_speed_is_fallback():
	output, _ = _run(rotate.RotateAction, _pin("rotate/signal pin", 19))
	assert output == FALLBACK
	assert PWM.signals == {}


# --- Release

def test_release_cuts_the_signal():
	_run(rotate.RotateAction, _pin("rotate/signal pin", 19), _number("rotate/speed", 80))
	assert 19 in PWM.signals

	output, _ = _run(release.ReleaseAction, _pin("release/signal pin", 19))

	assert output == SUCCESS
	assert 19 not in PWM.signals


def test_release_without_pin_is_fallback():
	assert _run(release.ReleaseAction)[0] == FALLBACK


def test_release_of_a_pin_without_signal_succeeds():
	assert _run(release.ReleaseAction, _pin("release/signal pin", 19))[0] == SUCCESS


# --- one PWM per pin (regression: a second PWM on a pin fails on the ESP32
# with "PWM is inactive", which the simulated PWM reproduces)

def test_the_same_action_runs_again_on_its_pin():
	# A looping program runs Rotate over and over on the same pin.
	for speed in (20, 60, 100):
		output, _ = _run(rotate.RotateAction, _pin("rotate/signal pin", 32), _number("rotate/speed", speed))
		assert output == SUCCESS
	assert _pulse_us(32) == 2000


def test_different_actions_share_the_pin():
	assert _run(to_angle.ToAngleAction, _pin("to angle/signal pin", 32), _number("to angle/angle", 0))[0] == SUCCESS
	assert _run(rotate.RotateAction, _pin("rotate/signal pin", 32), _number("rotate/speed", 0))[0] == SUCCESS
	assert _pulse_us(32) == 1500


def test_a_released_pin_can_be_driven_again():
	_run(rotate.RotateAction, _pin("rotate/signal pin", 32), _number("rotate/speed", 50))
	_run(release.ReleaseAction, _pin("release/signal pin", 32))
	assert 32 not in PWM.signals

	assert _run(rotate.RotateAction, _pin("rotate/signal pin", 32), _number("rotate/speed", 50))[0] == SUCCESS
	assert _pulse_us(32) == 1750


def test_a_new_signal_starts_without_a_pulse():
	# A servo must not twitch when its PWM is created — only once a duty is set.
	signal = driver.pwm_on(5)
	assert PWM.signals[5] == {"freq": 50, "duty_ns": 0}
	assert driver.pwm_on(5) is signal


# --- end to end: the host runs it over the wire

def test_to_angle_over_the_wire():

	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "servo/to angle", configs=[_pin("to angle/signal pin", 21), _number("to angle/angle", 180)]))
			done = await host.response(0x10)
			assert (done.command_id, done.id) == (CommandId.EXECUTE, OutputId.SUCCESS)
			assert struct.unpack("<i", done.configs[generate_id("angle")])[0] == 180
			assert _pulse_us(21) == 2500

	asyncio.run(scenario())
