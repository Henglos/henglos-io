# Lists and objects end to end: an action publishes one (DataType.JSON), a
# script or a bound config reads it back as a list / dict, and the Variables
# component's Append / Set Field / Clear keep one in a workflow variable.

import asyncio
import json
import struct

from support import Host

from hio.sdk import HIOAction, action
from hio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.Context import decode_value, encode_value
from hio.system.core.packets.ActionBody import decode_action_body, encode_action_body
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.services.PacketCodec import (
	CodeLink, Config, DataType, MAX_DATA_BUFFER, OutputId, VariableLink,
)


@action("j/scan")
class _ScanAction(HIOAction):
	# Publishes a list of objects, and echoes back what it was given.
	async def execute(self, context):
		context.set("networks", [{"ssid": "Home", "rssi": -55}, {"ssid": "Café", "rssi": -72}])
		for name, value in (("given", context.get("j/items")), ("history", context.variable("history"))):
			if value is not None:
				context.set(name, value)
		return None


def _execute(frame_id: int, action_name: str, configs=(), variables=(), codes=()) -> bytes:
	packet = ExecutePacket(frame_id)
	packet.action_id = generate_id(action_name)
	packet.configs = list(configs)
	packet.variables = list(variables)
	packet.codes = list(codes)
	return packet.encode()


def _target(action: str, name: str) -> Config:
	return Config(generate_id(action + "/variable"), DataType.UINT_16, struct.pack("<H", variable_id(name)))


def _json(config_id: int, value) -> Config:
	return Config(config_id, DataType.JSON, json.dumps(value).encode(), True)


def _int(config_id: int, value: int) -> Config:
	return Config(config_id, DataType.INT_32, struct.pack("<i", value))


def _history(host_response) -> list:
	return json.loads(host_response.configs[generate_id("history")])


def test_lists_and_dicts_encode_as_json_and_bytes_stay_bytes():
	encoded = encode_value(1, [1, 2.5, "a", {"b": True}])
	assert encoded.data_type == DataType.JSON and encoded.is_array
	assert decode_value(encoded) == [1, 2.5, "a", {"b": True}]
	assert decode_value(encode_value(2, (1, 2))) == [1, 2]
	assert decode_value(encode_value(3, {"x": 1})) == {"x": 1}
	assert encode_value(4, b"\x01\x02").data_type == DataType.UINT_8            # bytes: unchanged
	assert decode_value(Config(5, DataType.JSON, b"not json", True)) == b"not json"


def test_a_json_literal_survives_the_action_body():
	packet = ExecutePacket(1)
	packet.action_id = generate_id("j/scan")
	packet.configs = [_json(generate_id("j/items"), [1, 2, 3])]
	payload = bytearray()
	encode_action_body(packet, payload)

	decoded = ExecutePacket(1)
	assert decode_action_body(decoded, memoryview(bytes(payload)))
	[config] = decoded.configs
	assert config.data_type == DataType.JSON and decode_value(config) == [1, 2, 3]


def test_an_action_publishes_a_list_and_reads_a_list_config():
	async def go():
		async with Host() as host:
			host.send(_execute(1, "j/scan", configs=[_json(generate_id("j/items"), [{"x": 1}])]))
			response = await host.response(1)
			assert json.loads(response.configs[generate_id("networks")]) == [{"ssid": "Home", "rssi": -55}, {"ssid": "Café", "rssi": -72}]
			assert json.loads(response.configs[generate_id("given")]) == [{"x": 1}]

	asyncio.run(go())


def test_a_script_returns_a_list():
	async def go():
		async with Host() as host:
			code = CodeLink(generate_id("j/items"), DataType.JSON, True, b"return [n * 2 for n in range(3)]")
			host.send(_execute(1, "j/scan", codes=[code]))
			assert json.loads((await host.response(1)).configs[generate_id("given")]) == [0, 2, 4]

	asyncio.run(go())


def test_append_keeps_a_history_and_max_items_keeps_the_newest():
	async def go():
		async with Host() as host:
			for i, reading in enumerate([10, 20, 30, 40], start=1):
				host.send(_execute(i, "variables/append", configs=[
					_target("append", "history"), _int(generate_id("append/value"), reading), _int(generate_id("append/max items"), 3),
				]))
				assert (await host.response(i)).id == OutputId.SUCCESS
			host.send(_execute(9, "j/scan"))
			assert _history(await host.response(9)) == [20, 30, 40]

	asyncio.run(go())


def test_append_takes_text_and_objects_and_drops_the_oldest_past_the_size_limit():
	async def go():
		async with Host() as host:
			big = "x" * (MAX_DATA_BUFFER // 3)
			for i in range(1, 6):
				host.send(_execute(i, "variables/append", configs=[
					_target("append", "history"), Config(generate_id("append/value"), DataType.UINT_8, ("%d" % i + big).encode(), True),
				]))
				assert (await host.response(i)).id == OutputId.SUCCESS
			host.send(_execute(9, "j/scan"))
			history = _history(await host.response(9))
			assert history[-1].startswith("5") and len(json.dumps(history)) <= MAX_DATA_BUFFER
			assert len(history) < 5                                         # the oldest went

			host.send(_execute(10, "variables/append", configs=[_target("append", "points"), _json(generate_id("append/value"), {"x": 1, "y": 2})]))
			assert (await host.response(10)).id == OutputId.SUCCESS

	asyncio.run(go())


def test_set_field_and_clear():
	async def go():
		async with Host() as host:
			host.send(_execute(1, "variables/set field", configs=[
				_target("set field", "history"),
				Config(generate_id("set field/field"), DataType.UINT_8, b"temp", True),
				Config(generate_id("set field/value"), DataType.FLOAT_32, struct.pack("<f", 21.5)),
			]))
			assert (await host.response(1)).id == OutputId.SUCCESS
			host.send(_execute(2, "j/scan"))
			assert _history(await host.response(2)) == {"temp": 21.5}

			host.send(_execute(3, "variables/clear", configs=[_target("clear", "history")]))
			assert (await host.response(3)).id == OutputId.SUCCESS
			host.send(_execute(4, "j/scan"))
			assert _history(await host.response(4)) == {}

	asyncio.run(go())


def test_operations_without_a_variable_or_a_value_go_out_fallback():
	async def go():
		async with Host() as host:
			host.send(_execute(1, "variables/append", configs=[_int(generate_id("append/value"), 1)]))
			assert (await host.response(1)).id == OutputId.FALLBACK
			host.send(_execute(2, "variables/append", configs=[_target("append", "history")]))
			assert (await host.response(2)).id == OutputId.FALLBACK
			host.send(_execute(3, "variables/set field", configs=[_target("set field", "h"), _int(generate_id("set field/value"), 1)]))
			assert (await host.response(3)).id == OutputId.FALLBACK                # no field name

	asyncio.run(go())


def test_a_bound_variable_holding_a_list_reaches_the_action_as_a_list():
	async def go():
		async with Host() as host:
			host.send(_execute(1, "variables/append", configs=[_target("append", "history"), _int(generate_id("append/value"), 7)]))
			await host.response(1)
			host.send(_execute(2, "j/scan", variables=[VariableLink(generate_id("j/items"), variable_id("history"))]))
			assert json.loads((await host.response(2)).configs[generate_id("given")]) == [7]

	asyncio.run(go())
