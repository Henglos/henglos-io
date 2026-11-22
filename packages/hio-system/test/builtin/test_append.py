# builtin/variables/Append.py — "variables/append": Value at the end of the
# list Variable. Max Items keeps the newest; past MAX_DATA_BUFFER the oldest go.

import asyncio
import json

from support import Host

from builtin_support import execute, integer, json_value, read_variable, records, target, text
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.services.PacketCodec import MAX_DATA_BUFFER, OutputId


async def _append(host, frame_id: int, variable: str, value, max_items: "int | None" = None) -> int:
	configs = [target("append", variable), value]
	if max_items is not None:
		configs.append(integer("append/max items", max_items))
	host.send(execute(frame_id, "variables/append", configs))
	return (await host.response(frame_id)).id


async def _list(host, frame_id: int, variable: str):
	return json.loads(await read_variable(host, frame_id, variable))


def test_append_starts_a_list_and_adds_to_its_end():
	async def go():
		async with Host() as host:
			assert await _append(host, 1, "history", integer("append/value", 10)) == OutputId.SUCCESS
			assert await _append(host, 2, "history", text("append/value", "b")) == OutputId.SUCCESS
			assert await _append(host, 3, "history", json_value("append/value", {"x": 1})) == OutputId.SUCCESS
			assert await _list(host, 4, "history") == [10, "b", {"x": 1}]

	asyncio.run(go())


def test_max_items_keeps_the_newest():
	async def go():
		async with Host() as host:
			for frame_id, reading in enumerate([10, 20, 30, 40], start=1):
				assert await _append(host, frame_id, "history", integer("append/value", reading), max_items=3) == OutputId.SUCCESS
			assert await _list(host, 9, "history") == [20, 30, 40]

	asyncio.run(go())


def test_past_the_size_limit_the_oldest_go():
	async def go():
		async with Host() as host:
			big = "x" * (MAX_DATA_BUFFER // 3)
			for i in range(1, 6):
				assert await _append(host, i, "history", text("append/value", "%d" % i + big)) == OutputId.SUCCESS
			history = await _list(host, 9, "history")
			assert history[-1].startswith("5") and len(json.dumps(history)) <= MAX_DATA_BUFFER
			assert len(history) < 5

	asyncio.run(go())


def test_appending_to_a_variable_that_is_not_a_list_starts_a_new_one():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/set", [target("set", "history"), integer("set/value", 5)]))
			await host.response(1)
			assert await _append(host, 2, "history", integer("append/value", 1)) == OutputId.SUCCESS
			assert await _list(host, 3, "history") == [1]

	asyncio.run(go())


def test_append_without_a_variable_or_a_value_goes_out_fallback():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/append", [integer("append/value", 1)]))
			assert (await host.response(1)).id == OutputId.FALLBACK
			host.send(execute(2, "variables/append", [target("append", "history")]))
			assert (await host.response(2)).id == OutputId.FALLBACK

	asyncio.run(go())


def test_append_is_an_action_in_the_registry(tmp_path):
	action_id = generate_id("variables/append")
	assert registry.find(action_id) is not None
	assert action_id not in FLOW_ACTION_IDS
	assert records(tmp_path, "variables/append") == OutputId.SUCCESS
