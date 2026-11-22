# builtin/variables/SetField.py — "variables/set field": Field of the object
# Variable set to Value, added when it isn't there.

import asyncio
import json

from support import Host

from builtin_support import execute, integer, number, read_variable, records, target, text
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.services.PacketCodec import OutputId


async def _set_field(host, frame_id: int, variable: str, field: str, value) -> int:
	host.send(execute(frame_id, "variables/set field", [target("set field", variable), text("set field/field", field), value]))
	return (await host.response(frame_id)).id


def test_set_field_starts_an_object_adds_and_overwrites_fields():
	async def go():
		async with Host() as host:
			assert await _set_field(host, 1, "reading", "temp", number("set field/value", 21.5)) == OutputId.SUCCESS
			assert await _set_field(host, 2, "reading", "unit", text("set field/value", "C")) == OutputId.SUCCESS
			assert await _set_field(host, 3, "reading", "temp", integer("set field/value", 22)) == OutputId.SUCCESS
			assert json.loads(await read_variable(host, 4, "reading")) == {"temp": 22, "unit": "C"}

	asyncio.run(go())


def test_set_field_on_a_variable_that_is_not_an_object_starts_a_new_one():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/set", [target("set", "reading"), integer("set/value", 5)]))
			await host.response(1)
			assert await _set_field(host, 2, "reading", "a", integer("set field/value", 1)) == OutputId.SUCCESS
			assert json.loads(await read_variable(host, 3, "reading")) == {"a": 1}

	asyncio.run(go())


def test_set_field_without_a_variable_a_field_or_a_value_goes_out_fallback():
	async def go():
		async with Host() as host:
			host.send(execute(1, "variables/set field", [target("set field", "h"), integer("set field/value", 1)]))
			assert (await host.response(1)).id == OutputId.FALLBACK                 # no field
			assert await _set_field(host, 2, "h", "", integer("set field/value", 1)) == OutputId.FALLBACK
			host.send(execute(3, "variables/set field", [target("set field", "h"), text("set field/field", "a")]))
			assert (await host.response(3)).id == OutputId.FALLBACK                 # no value
			host.send(execute(4, "variables/set field", [text("set field/field", "a"), integer("set field/value", 1)]))
			assert (await host.response(4)).id == OutputId.FALLBACK                 # no variable

	asyncio.run(go())


def test_set_field_is_an_action_in_the_registry(tmp_path):
	action_id = generate_id("variables/set field")
	assert registry.find(action_id) is not None
	assert action_id not in FLOW_ACTION_IDS
	assert records(tmp_path, "variables/set field") == OutputId.SUCCESS
