# builtin/variables/Remove.py — "variables/remove": Variable back to no value,
# until a Set writes it again.

import asyncio

from support import Host

from builtin_support import as_int, execute, integer, read_variable, records, target
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.services.PacketCodec import Config, DataType, OutputId


async def _remove(host, frame_id: int, variable: str) -> int:
	host.send(execute(frame_id, "variables/remove", [target("remove", variable)]))
	return (await host.response(frame_id)).id


def test_remove_takes_the_value_away_until_a_set_writes_it_again():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [Config(variable_id("count"), DataType.INTEGER, integer("_", 5).data)]))
			await host.response(1)

			assert await _remove(host, 2, "count") == OutputId.SUCCESS
			assert await read_variable(host, 3, "count") is None

			host.send(execute(4, "variables/set", [target("set", "count"), integer("set/value", 8)]))
			await host.response(4)
			assert as_int(await read_variable(host, 5, "count")) == 8

	asyncio.run(go())


def test_removing_a_variable_with_no_value_is_no_error():
	async def go():
		async with Host() as host:
			assert await _remove(host, 1, "never set") == OutputId.SUCCESS
			assert await _remove(host, 2, "never set") == OutputId.SUCCESS

	asyncio.run(go())


def test_remove_without_a_variable_goes_out_fallback():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/remove"))
			assert (await host.response(1)).id == OutputId.FALLBACK

	asyncio.run(go())


def test_remove_is_an_action_in_the_registry(tmp_path):
	action_id = generate_id("variables/remove")
	assert registry.find(action_id) is not None
	assert action_id not in FLOW_ACTION_IDS
	assert records(tmp_path, "variables/remove") == OutputId.SUCCESS
