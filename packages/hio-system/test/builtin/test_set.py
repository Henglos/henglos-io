# builtin/variables/Set.py — "variables/set": Value into Variable, with the
# type it arrived as.

import asyncio

from support import Host

from builtin_support import as_int, execute, integer, json_value, read_variable, records, target, text
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.services.PacketCodec import CodeLink, Config, DataType, OutputId, VariableLink


def test_set_writes_a_value_and_overwrites_it():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/set", [target("set", "count"), integer("set/value", 42)]))
			assert (await host.response(1)).id == OutputId.SUCCESS
			assert as_int(await read_variable(host, 2, "count")) == 42

			host.send(execute(3, "variables/set", [target("set", "count"), text("set/value", "now text")]))
			assert (await host.response(3)).id == OutputId.SUCCESS
			assert await read_variable(host, 4, "count") == b"now text"               # the type it arrived as

	asyncio.run(go())


def test_set_keeps_a_list():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/set", [target("set", "points"), json_value("set/value", [1, 2])]))
			assert (await host.response(1)).id == OutputId.SUCCESS
			assert await read_variable(host, 2, "points") == b"[1, 2]"

	asyncio.run(go())


def test_set_can_take_its_value_from_another_variable():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [Config(variable_id("other"), DataType.INTEGER, integer("_", 7).data)]))
			await host.response(1)
			host.send(execute(2, "variables/set", [target("set", "count")],
				variables=[VariableLink(generate_id("set/value"), variable_id("other"))]))
			assert (await host.response(2)).id == OutputId.SUCCESS
			assert as_int(await read_variable(host, 3, "count")) == 7

	asyncio.run(go())


def test_set_takes_a_script_returning_a_bool():
	# RESULT TYPE AUTO (what an "any" config's script gets): `return not …`
	# stores True — not refused for not being Value's literal kind (int32).
	async def go():
		async with Host() as host:
			code = CodeLink(generate_id("set/value"), DataType.AUTO, b'return not ctx.var("state")')
			host.send(execute(1, "variables/set", [target("set", "state")], codes=[code]))
			assert (await host.response(1)).id == OutputId.SUCCESS
			assert await read_variable(host, 2, "state") == b"\x01"

	asyncio.run(go())


def test_set_without_a_variable_or_a_value_goes_out_fallback():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/set", [target("set", "count")]))
			assert (await host.response(1)).id == OutputId.FALLBACK
			host.send(execute(2, "variables/set", [integer("set/value", 1)]))
			assert (await host.response(2)).id == OutputId.FALLBACK
			assert await read_variable(host, 3, "count") is None

	asyncio.run(go())


def test_a_set_with_an_empty_value_does_not_take_another_sets_leftover():
	# The first Set leaves "set/value" in the pipeline (Pass Context keeps it);
	# a second Set without a value must not store that leftover.
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/set", [
				target("set", "count"), integer("set/value", 3),
				Config(generate_id("context/pass"), DataType.BOOL, b"\x01"),
			]))
			assert (await host.response(1)).id == OutputId.SUCCESS

			host.send(execute(2, "variables/set", [target("set", "other")]))
			assert (await host.response(2)).id == OutputId.FALLBACK
			assert await read_variable(host, 3, "other") is None

	asyncio.run(go())


def test_set_is_an_action_in_the_registry(tmp_path):
	action_id = generate_id("variables/set")
	assert registry.find(action_id) is not None
	assert action_id not in FLOW_ACTION_IDS
	assert records(tmp_path, "variables/set") == OutputId.SUCCESS
