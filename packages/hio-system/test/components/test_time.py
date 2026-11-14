# The Time component's actions (packages/library/components/Time), loaded the
# way the board would — by importing their source, which registers them.

import asyncio
import importlib.util
import os
import struct
import time

import pytest

from support import Host, execute_frame

from henglosio.sdk import SUCCESS, FALLBACK, generate_id
from henglosio.sdk.core import registry
from hio.system.core.Context import ActionContext, PipelineContext
from hio.system.core.services.PacketCodec import CommandId, OutputId, Config, DataType

_TIME = os.path.join(
	os.path.dirname(os.path.abspath(__file__)),
	"..", "..", "..", "library", "components", "Time", "src",
)


def _load(name: str):
	spec = importlib.util.spec_from_file_location("time_component_" + name, os.path.join(_TIME, name + ".py"))
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


delay = _load("delay")
uptime = _load("uptime")
start_timer = _load("start_timer")
elapsed = _load("elapsed")
every = _load("every")


def _number(name: str, value: float) -> Config:
	return Config(generate_id(name), DataType.FLOAT, struct.pack("<f", value))


def _text(name: str, value: str) -> Config:
	return Config(generate_id(name), DataType.STRING, value.encode())


def _run(action_class, *configs, pipeline=None):
	# Runs one action; (output, ActionContext). Pass `pipeline` to share the
	# values between actions, as a program run does.
	pipeline = pipeline or PipelineContext(16)
	for config in configs:
		pipeline.merge(config)
	context = ActionContext(pipeline, {})
	action = action_class()
	action.initialize()
	action.context = context
	return asyncio.run(action.execute(context)), context


def _published(context: ActionContext) -> dict:
	return {config.config_id: config for config in context.results}


def _int(config: Config) -> int:
	return struct.unpack("<i", config.data)[0]


# --- registration

def test_actions_register_under_their_wire_ids():
	assert registry.find(generate_id("time/delay")) is delay.DelayAction
	assert registry.find(generate_id("time/uptime")) is uptime.UptimeAction
	assert registry.find(generate_id("time/start timer")) is start_timer.StartTimerAction
	assert registry.find(generate_id("time/elapsed")) is elapsed.ElapsedAction
	assert registry.find(generate_id("time/every")) is every.EveryAction


# --- Delay

@pytest.mark.parametrize("duration, unit, ms", [(60, "ms", 60), (0.06, "s", 60)])
def test_delay_waits_and_publishes_the_milliseconds(duration, unit, ms):
	started = time.monotonic()
	output, context = _run(delay.DelayAction, _number("delay/duration", duration), _text("delay/unit", unit))

	assert output == SUCCESS
	assert time.monotonic() - started >= (ms - 5) / 1000
	assert _int(_published(context)[generate_id("duration")]) == ms


def test_delay_without_unit_is_milliseconds():
	output, context = _run(delay.DelayAction, _number("delay/duration", 10))
	assert output == SUCCESS
	assert _int(_published(context)[generate_id("duration")]) == 10


@pytest.mark.parametrize("configs", [
	(),                                                                  # no duration
	(_number("delay/duration", -1),),                                    # negative
	(_number("delay/duration", 10), _text("delay/unit", "hours")),       # unknown unit
])
def test_delay_with_bad_configs_is_fallback(configs):
	output, context = _run(delay.DelayAction, *configs)
	assert output == FALLBACK
	assert context.results == []


# --- Uptime

def test_uptime_publishes_the_clock():
	output, context = _run(uptime.UptimeAction)
	assert output == SUCCESS
	assert _int(_published(context)[generate_id("uptime")]) >= 0


# --- Start Timer / Elapsed

def test_elapsed_measures_since_start_timer():
	pipeline = PipelineContext(16)

	assert _run(start_timer.StartTimerAction, _text("start timer/name", "t"), pipeline=pipeline)[0] == SUCCESS
	time.sleep(0.05)
	output, context = _run(elapsed.ElapsedAction, _text("elapsed/name", "t"), pipeline=pipeline)

	assert output == SUCCESS
	assert 40 <= _int(_published(context)[generate_id("elapsed")]) < 1000


def test_timers_are_independent_by_name():
	pipeline = PipelineContext(16)
	_run(start_timer.StartTimerAction, _text("start timer/name", "a"), pipeline=pipeline)

	assert _run(elapsed.ElapsedAction, _text("elapsed/name", "b"), pipeline=pipeline)[0] == FALLBACK


def test_elapsed_without_start_timer_is_fallback():
	assert _run(elapsed.ElapsedAction, _text("elapsed/name", "t"))[0] == FALLBACK


# --- Every

def _every(pipeline, name="e", interval=50):
	return _run(every.EveryAction, _number("every/interval", interval), _text("every/name", name), pipeline=pipeline)[0]


def test_every_is_due_once_per_interval():
	pipeline = PipelineContext(16)

	assert _every(pipeline) == every.DUE                # first run
	assert _every(pipeline) == every.WAIT               # right after
	time.sleep(0.06)
	assert _every(pipeline) == every.DUE                # interval passed
	assert _every(pipeline) == every.WAIT


def test_every_names_keep_their_own_rhythm():
	pipeline = PipelineContext(16)

	assert _every(pipeline, "a") == every.DUE
	assert _every(pipeline, "b") == every.DUE
	assert _every(pipeline, "a") == every.WAIT


def test_every_without_interval_is_fallback():
	output, _ = _run(every.EveryAction, _text("every/name", "e"))
	assert output == FALLBACK


# --- end to end: the host runs them over the wire

def test_delay_over_the_wire():

	async def scenario():
		async with Host() as host:
			host.send(execute_frame(0x10, "time/delay", configs=[_number("delay/duration", 20), _text("delay/unit", "ms")]))
			done = await host.response(0x10)
			assert (done.command_id, done.id) == (CommandId.EXECUTE, OutputId.SUCCESS)
			assert struct.unpack("<i", done.configs[generate_id("duration")])[0] == 20

	asyncio.run(scenario())


def test_every_over_the_wire_answers_its_branch():
	# A branching action answers generateId("<handle id>") — what the host's
	# ResolveNextAction matches the Due/Waiting connection by.

	async def scenario():
		async with Host() as host:
			configs = [_number("every/interval", 10000), _text("every/name", "wire")]
			host.send(execute_frame(0x10, "time/every", configs=configs))
			assert (await host.response(0x10)).id == generate_id("due")
			host.send(execute_frame(0x11, "time/every", configs=configs))
			assert (await host.response(0x11)).id == generate_id("wait")

	asyncio.run(scenario())


# --- Timer Trigger

timer_trigger = _load("timer_trigger")


def test_timer_trigger_fires_every_interval(monkeypatch):
	from hio.system.core.Context import TriggerContext
	from hio.system.core.services.TriggerService import trigger_class
	assert trigger_class(generate_id("time/timer trigger")) is timer_trigger.TimerTrigger

	now = [1000]
	monkeypatch.setattr(timer_trigger, "ticks_ms", lambda: now[0])
	context = TriggerContext([_number("timer trigger/interval", 100)])
	node = timer_trigger.TimerTrigger()
	node.arm(context)

	now[0] += 50
	assert node.poll(context) is False
	now[0] += 60
	assert node.poll(context) is True
	assert [struct.unpack("<i", bytes(result.data))[0] for result in context.results if result.config_id == generate_id("count")] == [1]
