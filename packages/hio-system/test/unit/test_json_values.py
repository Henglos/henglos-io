# Lists and objects end to end: an action publishes one (DataType.LIST / OBJECT), a
# script or a bound config reads it back as a list / dict, and a workflow
# variable holds one (Append / Set Field / Clear: test/builtin).

import asyncio
import json
import struct

from support import Host

from henglosio.sdk import HIOAction, action
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.Context import decode_value, encode_value
from hio.system.core.packets.ActionBody import decode_action_body, encode_action_body
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.services.PacketCodec import (
	CodeLink, Config, DataType, VariableLink,
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
	return Config(generate_id(action + "/variable"), DataType.INTEGER, struct.pack("<i", variable_id(name)))


def _json(config_id: int, value) -> Config:
	return Config(config_id, DataType.LIST if isinstance(value, list) else DataType.OBJECT, json.dumps(value).encode())


def _int(config_id: int, value: int) -> Config:
	return Config(config_id, DataType.INTEGER, struct.pack("<i", value))


def test_lists_and_dicts_encode_as_json_and_bytes_stay_bytes():
	encoded = encode_value(1, [1, 2.5, "a", {"b": True}])
	assert encoded.data_type == DataType.LIST
	assert decode_value(encoded) == [1, 2.5, "a", {"b": True}]
	assert decode_value(encode_value(2, (1, 2))) == [1, 2]
	assert encode_value(3, {"x": 1}).data_type == DataType.OBJECT
	assert decode_value(encode_value(3, {"x": 1})) == {"x": 1}
	assert encode_value(4, b"\x01\x02").data_type == DataType.BYTES             # bytes: unchanged
	assert decode_value(Config(5, DataType.LIST, b"not json")) == b"not json"


def test_a_json_literal_survives_the_action_body():
	packet = ExecutePacket(1)
	packet.action_id = generate_id("j/scan")
	packet.configs = [_json(generate_id("j/items"), [1, 2, 3])]
	payload = bytearray()
	encode_action_body(packet, payload)

	decoded = ExecutePacket(1)
	assert decode_action_body(decoded, memoryview(bytes(payload)))
	[config] = decoded.configs
	assert config.data_type == DataType.LIST and decode_value(config) == [1, 2, 3]


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
			code = CodeLink(generate_id("j/items"), DataType.LIST, b"return [n * 2 for n in range(3)]")
			host.send(_execute(1, "j/scan", codes=[code]))
			assert json.loads((await host.response(1)).configs[generate_id("given")]) == [0, 2, 4]

	asyncio.run(go())


def test_a_bound_variable_holding_a_list_reaches_the_action_as_a_list():
	async def go():
		async with Host() as host:
			host.send(_execute(1, "variables/append", configs=[_target("append", "history"), _int(generate_id("append/value"), 7)]))
			await host.response(1)
			host.send(_execute(2, "j/scan", variables=[VariableLink(generate_id("j/items"), variable_id("history"))]))
			assert json.loads((await host.response(2)).configs[generate_id("given")]) == [7]

	asyncio.run(go())
