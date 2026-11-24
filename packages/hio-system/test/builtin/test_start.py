# builtin/Start.py — "core/start", the program's entry: its mode, and the
# variables' initial values it seeds.

import asyncio

from support import Host

from builtin_support import as_int, execute, integer, read_variable, records, run, target
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.builtin import FLOW_ACTION_IDS, Start
from hio.system.core.builtin.Start import FlowMode
from hio.system.core.services.PacketCodec import Config, DataType, OutputId


def _mode(value: bytes) -> Config:
	return Config(Start.MODE_ID, DataType.STRING, value)


def _seed(name: str, value: int) -> Config:
	return Config(variable_id(name), DataType.INTEGER, integer("_", value).data)


def test_mode_reads_once_and_loop():
	assert Start.mode([_mode(b"once")]) == FlowMode.ONCE
	assert Start.mode([_mode(b"loop")]) == FlowMode.LOOP


def test_an_unknown_mode_is_unknown_and_none_leaves_it_as_it_was():
	assert Start.mode([_mode(b"nope")]) == FlowMode.UNKNOWN
	assert Start.mode([]) is None
	assert Start.mode([_seed("count", 1)]) is None                # a variable's seed isn't the mode


def test_its_ids():
	assert Start.ACTION_ID == generate_id("core/start")
	assert Start.MODE_ID == generate_id("start/mode")


def test_start_seeds_the_variables_and_goes_out_success():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [_mode(b"loop"), _seed("count", 5)]))
			assert (await host.response(1)).id == OutputId.SUCCESS
			assert as_int(await read_variable(host, 2, "count")) == 5

	asyncio.run(go())


def test_looping_back_to_start_keeps_what_the_program_wrote():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [_seed("count", 5)]))
			await host.response(1)
			host.send(execute(2, "variables/set", [target("set", "count"), integer("set/value", 9)]))
			await host.response(2)

			host.send(execute(3, "core/start", [_seed("count", 5)]))     # the initial value isn't applied again
			await host.response(3)
			assert as_int(await read_variable(host, 4, "count")) == 9

	asyncio.run(go())


def test_a_run_of_start_only_seeds_the_variables():
	async def go():
		async with Host() as host:
			host.send(run(1, "core/start", [_mode(b"once"), _seed("count", 3)]))
			assert (await host.response(1)).id == OutputId.SUCCESS
			assert as_int(await read_variable(host, 2, "count")) == 3

	asyncio.run(go())


def test_start_is_run_by_the_runtime_not_the_registry(tmp_path):
	assert Start.ACTION_ID in FLOW_ACTION_IDS
	assert registry.find(Start.ACTION_ID) is None
	assert records(tmp_path, "core/start") == OutputId.SUCCESS


def test_a_text_seed_reads_as_text():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [Config(variable_id("greeting"), DataType.STRING, b"oi")]))
			await host.response(1)
			assert await read_variable(host, 2, "greeting") == b"oi"

	asyncio.run(go())


def _fresh() -> Config:
	return Config(Start.FRESH_ID, DataType.BOOL, b"\x01")


def test_a_start_that_begins_a_session_starts_the_variables_over():
	# A value changed in the studio (or written by the last session) doesn't
	# linger: "start/fresh" drops what the variables hold, then seeds them.
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [_fresh(), _seed("count", 5)]))
			await host.response(1)
			host.send(execute(2, "variables/set", [target("set", "count"), integer("set/value", 9)]))
			await host.response(2)

			host.send(execute(3, "core/start", [_seed("count", 5)]))          # a loop: keeps 9
			await host.response(3)
			assert as_int(await read_variable(host, 4, "count")) == 9

			host.send(execute(5, "core/start", [_fresh(), _seed("count", 7)]))  # a new session: its initial value
			await host.response(5)
			assert as_int(await read_variable(host, 6, "count")) == 7

	asyncio.run(go())


def test_a_fresh_start_drops_a_variable_with_no_initial_value():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/set", [target("set", "left"), integer("set/value", 3)]))
			await host.response(1)
			host.send(run(2, "core/start", [_fresh()]))
			await host.response(2)
			assert await read_variable(host, 3, "left") is None

	asyncio.run(go())


def test_the_fresh_flag_is_not_a_variable():
	assert Start.fresh([_fresh()])
	assert not Start.fresh([Config(Start.FRESH_ID, DataType.BOOL, b"\x00")])
	assert not Start.fresh([_seed("count", 1)])
	assert Start.FRESH_ID == generate_id("start/fresh")
