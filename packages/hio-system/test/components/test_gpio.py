# The GPIO component's actions (packages/library/components/GPIO), loaded the
# way the board would — by importing their source, which registers them —
# against the simulated machine.Pin from conftest.

import asyncio
import importlib.util
import os
import struct

import pytest
from machine import Pin

from support import Host, execute_frame

from hio.sdk import SUCCESS, FALLBACK, generate_id
from hio.sdk.core import registry
from hio.system.core.Context import ActionContext, PipelineContext
from hio.system.core.services.PacketCodec import CommandId, OutputId, Config, DataType

_GPIO = os.path.join(
	os.path.dirname(os.path.abspath(__file__)),
	"..", "..", "..", "library", "components", "GPIO", "src",
)


def _load(name: str):
	spec = importlib.util.spec_from_file_location("gpio_" + name, os.path.join(_GPIO, name + ".py"))
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


write = _load("write")
read = _load("read")


def _pin(name: str, number: int) -> Config:
	return Config(generate_id(name), DataType.INTEGER, struct.pack("<i", number))


def _bool(name: str, value: bool) -> Config:
	return Config(generate_id(name), DataType.BOOL, b"\x01" if value else b"\x00")


def _run(action_class, *configs):
	# Runs one action on its own; (output, ActionContext).
	pipeline = PipelineContext(16)
	for config in configs:
		pipeline.merge(config)
	context = ActionContext(pipeline, {})
	action = action_class()
	action.initialize()
	action.context = context
	return asyncio.run(action.execute(context)), context


def _published(context: ActionContext) -> dict:
	return {config.config_id: bytes(config.data) for config in context.results}


@pytest.fixture(autouse=True)
def board():
	Pin.reset()
	yield
	Pin.reset()


# --- registration

def test_actions_register_under_their_wire_ids():
	assert registry.find(generate_id("gpio/write")) is write.WriteAction
	assert registry.find(generate_id("gpio/read")) is read.ReadAction


# --- Write

@pytest.mark.parametrize("value, level", [(True, 1), (False, 0)])
def test_write_drives_the_pin(value, level):
	output, context = _run(write.WriteAction, _pin("write/pin", 4), _bool("write/value", value))

	assert output == SUCCESS
	assert Pin.modes[4] == Pin.OUT
	assert Pin.levels[4] == level
	assert _published(context) == {generate_id("value"): bytes((level,))}


def test_write_without_pin_is_fallback():
	output, context = _run(write.WriteAction, _bool("write/value", True))

	assert output == FALLBACK
	assert Pin.levels == {}
	assert context.results == []


def test_write_without_value_is_fallback():
	output, _ = _run(write.WriteAction, _pin("write/pin", 4))

	assert output == FALLBACK
	assert Pin.levels == {}


def test_one_instance_serves_different_pins():
	# Two "GPIO Write" nodes share one action instance — each run uses its own pin.
	action = write.WriteAction()
	action.initialize()

	for pin, value in ((2, True), (5, False)):
		pipeline = PipelineContext(16)
		pipeline.merge(_pin("write/pin", pin))
		pipeline.merge(_bool("write/value", value))
		context = ActionContext(pipeline, {})
		action.context = context
		asyncio.run(action.execute(context))

	assert Pin.levels == {2: 1, 5: 0}


# --- Read

@pytest.mark.parametrize("level, expected", [(1, b"\x01"), (0, b"\x00")])
def test_read_publishes_the_level(level, expected):
	Pin.levels[7] = level

	output, context = _run(read.ReadAction, _pin("read/pin", 7))

	assert output == SUCCESS
	assert Pin.modes[7] == Pin.IN
	assert _published(context) == {generate_id("value"): expected}


def test_read_without_pin_is_fallback():
	output, context = _run(read.ReadAction)

	assert output == FALLBACK
	assert context.results == []


# --- end to end: the host runs both over the wire

def test_write_then_read_over_the_wire():

	async def scenario():
		async with Host() as host:

			host.send(execute_frame(0x10, "gpio/write", configs=[_pin("write/pin", 13), _bool("write/value", True)]))
			done = await host.response(0x10)
			assert (done.command_id, done.id) == (CommandId.EXECUTE, OutputId.SUCCESS)
			assert done.configs == {generate_id("value"): b"\x01"}
			assert Pin.levels[13] == 1

			host.send(execute_frame(0x11, "gpio/read", configs=[_pin("read/pin", 13)]))
			done = await host.response(0x11)
			assert (done.command_id, done.id) == (CommandId.EXECUTE, OutputId.SUCCESS)
			assert done.configs == {generate_id("value"): b"\x01"}

	asyncio.run(scenario())


def test_missing_pin_over_the_wire_is_fallback():

	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "gpio/write", configs=[_bool("write/value", True)]))
			done = await host.response(0x10)
			assert (done.command_id, done.id) == (CommandId.EXECUTE, OutputId.FALLBACK)

	asyncio.run(scenario())


# --- Pin Trigger

pin_trigger = _load("pin_trigger")


def test_pin_trigger_fires_on_an_edge_noted_by_its_interrupt():
	from hio.system.core.Context import TriggerContext
	from hio.system.core.services.TriggerService import trigger_class
	assert trigger_class(generate_id("gpio/pin trigger")) is pin_trigger.PinTrigger

	Pin.reset()
	context = TriggerContext([
		_pin("pin trigger/pin", 4),
		Config(generate_id("pin trigger/edge"), DataType.STRING, b"rising"),
		Config(generate_id("pin trigger/pull"), DataType.STRING, b"up"),
		Config(generate_id("pin trigger/debounce"), DataType.FLOAT, b"\x00\x00\x00\x00"),
	])
	node = pin_trigger.PinTrigger()
	node.initialize()
	node.arm(context)
	assert Pin.modes[4] == Pin.IN and Pin.pulls[4] == Pin.PULL_UP
	assert Pin.irqs[4][1] == Pin.IRQ_RISING

	assert node.poll(context) is False
	Pin.edge(4, 1)
	assert node.poll(context) is True
	assert any(result.config_id == generate_id("level") and bytes(result.data) == b"\x01" for result in context.results)

	node.disarm()
	assert 4 not in Pin.irqs
