# builtin/variables/Clear.py — "variables/clear": the list or object Variable
# emptied; an object stays an object, anything else becomes an empty list.

import asyncio
import json

from support import Host

from builtin_support import execute, integer, json_value, read_variable, records, target
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.services.PacketCodec import OutputId


async def _clear(host, frame_id: int, variable: str) -> int:
	host.send(execute(frame_id, "variables/clear", [target("clear", variable)]))
	return (await host.response(frame_id)).id


async def _set(host, frame_id: int, variable: str, value) -> None:
	host.send(execute(frame_id, "variables/set", [target("set", variable), value]))
	await host.response(frame_id)


def test_clear_empties_a_list():
	async def go():
		async with Host() as host:
			await _set(host, 1, "history", json_value("set/value", [1, 2, 3]))
			assert await _clear(host, 2, "history") == OutputId.SUCCESS
			assert json.loads(await read_variable(host, 3, "history")) == []

	asyncio.run(go())


def test_clear_keeps_an_object_an_object():
	async def go():
		async with Host() as host:
			await _set(host, 1, "reading", json_value("set/value", {"temp": 21}))
			assert await _clear(host, 2, "reading") == OutputId.SUCCESS
			assert json.loads(await read_variable(host, 3, "reading")) == {}

	asyncio.run(go())


def test_clear_makes_anything_else_an_empty_list():
	async def go():
		async with Host() as host:
			await _set(host, 1, "count", integer("set/value", 5))
			assert await _clear(host, 2, "count") == OutputId.SUCCESS
			assert json.loads(await read_variable(host, 3, "count")) == []
			assert await _clear(host, 4, "never set") == OutputId.SUCCESS
			assert json.loads(await read_variable(host, 5, "never set")) == []

	asyncio.run(go())


def test_clear_without_a_variable_goes_out_fallback():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/clear"))
			assert (await host.response(1)).id == OutputId.FALLBACK

	asyncio.run(go())


def test_clear_is_an_action_in_the_registry(tmp_path):
	action_id = generate_id("variables/clear")
	assert registry.find(action_id) is not None
	assert action_id not in FLOW_ACTION_IDS
	assert records(tmp_path, "variables/clear") == OutputId.SUCCESS
