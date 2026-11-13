# A BIND or a VARIABLE carries a value of whatever type it was published as; the
# action wants its config's (EXPECTED_TYPE). The runtime converts what it can
# without losing anything — and when it can't, the action doesn't run: it goes
# out Fallback, and the device log says which config, on which node, and why.

import asyncio
import json
import struct

import pytest

from support import Host

from hio.sdk import HIOAction, action
from hio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.Context import ConversionError, coerce, decode_value
from hio.system.core.packets.ActionBody import decode_action_body, encode_action_body
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.services.PacketCodec import BindLink, Config, DataType, OutputId, VariableLink

TEXT = DataType.STRING


def _text(value: str) -> Config:
	return Config(1, DataType.STRING, value.encode())


def _int(value: int) -> Config:
	return Config(1, DataType.INTEGER, struct.pack("<i", value))


def _float(value: float) -> Config:
	return Config(1, DataType.FLOAT, struct.pack("<f", value))


def _bool(value: bool) -> Config:
	return Config(1, DataType.BOOL, b"\x01" if value else b"\x00")


def _json(value) -> Config:
	return Config(1, DataType.LIST if isinstance(value, list) else DataType.OBJECT, json.dumps(value).encode())


def _value(config: Config):
	return decode_value(config)


# ── coerce ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("config, expected, value", [
	(_text("12"), DataType.INTEGER, 12),
	(_text(" -3 "), DataType.INTEGER, -3),
	(_text("4.0"), DataType.INTEGER, 4),
	(_float(3.0), DataType.INTEGER, 3),
	(_bool(True), DataType.INTEGER, 1),
	(_int(3), DataType.STRING, "3"),
	(_int(3), DataType.FLOAT, 3.0),
	(_text("2.5"), DataType.FLOAT, 2.5),
	(_text("TRUE"), DataType.BOOL, True),
	(_text("0"), DataType.BOOL, False),
	(_int(1), DataType.BOOL, True),
	(_int(7), TEXT, "7"),
	(_float(2.5), TEXT, "2.5"),
	(_bool(False), TEXT, "false"),
	(_json([1, "a"]), TEXT, '[1, "a"]'),
	(_text('[1, "a", true]'), DataType.LIST, [1, "a", True]),
	(_text('{"x": 1}'), DataType.OBJECT, {"x": 1}),
	(_text("hi"), DataType.BYTES, b"hi"),
])
def test_converts_what_loses_nothing(config, expected, value):
	assert _value(coerce(config, expected)) == value


@pytest.mark.parametrize("config, expected, message", [
	(_text("abc"), DataType.INTEGER, "expected integer, got str 'abc'"),
	(_float(3.7), DataType.INTEGER, "expected integer, got float"),
	(_text("maybe"), DataType.BOOL, "expected bool, got str 'maybe'"),
	(_int(2), DataType.BOOL, "expected bool, got int 2"),
	(_text("not json"), DataType.LIST, "expected list, got str 'not json'"),
	(_text("12"), DataType.OBJECT, "expected object, got str '12'"),
	(_json([1]), DataType.OBJECT, "expected object, got list [1]"),
	(_json([1, 2]), DataType.FLOAT, "expected float, got list [1, 2]"),
])
def test_refuses_what_would_lose_something(config, expected, message):
	with pytest.raises(ConversionError) as error:
		coerce(config, expected)
	assert str(error.value).startswith(message)


def test_auto_and_the_same_type_pass_as_they_are():
	text = _text("abc")
	assert coerce(text, DataType.AUTO) is text
	assert coerce(text, TEXT) is text


def test_a_long_value_is_cut_in_the_message():
	with pytest.raises(ConversionError) as error:
		coerce(_text("x" * 200), DataType.INTEGER)
	assert len(str(error.value)) < 90


# ── the wire ─────────────────────────────────────────────────────────────────

def test_binds_and_variables_carry_their_expected_type():
	packet = ExecutePacket(1)
	packet.action_id = 0x1111
	packet.binds = [BindLink(0x0A0A, 0x0B0B, DataType.INTEGER)]
	packet.variables = [VariableLink(0x0C0C, 0x0D0D, TEXT)]
	body = bytearray()
	encode_action_body(packet, body)

	decoded = ExecutePacket(1)
	assert decode_action_body(decoded, memoryview(bytes(body)))
	assert (decoded.binds[0].source_id, decoded.binds[0].expected_type) == (0x0B0B, DataType.INTEGER)
	assert (decoded.variables[0].variable_id, decoded.variables[0].expected_type) == (0x0D0D, TEXT)


# ── end to end ───────────────────────────────────────────────────────────────

@action("convert/produce")
class _Produce(HIOAction):
	async def execute(self, context):
		context.set("reading", "abc")
		context.set("count", "12")
		return None


@action("convert/consume")
class _Consume(HIOAction):
	ran = 0

	async def execute(self, context):
		_Consume.ran += 1
		context.set("seen", context.get("consume/level"))
		return None


def _execute(frame_id: int, name: str, binds=(), instance_id: int = 0) -> bytes:
	packet = ExecutePacket(frame_id)
	packet.action_id = generate_id(name)
	packet.instance_id = instance_id
	packet.binds = list(binds)
	return packet.encode()


def test_a_value_that_converts_reaches_the_action_as_its_type():
	async def go():
		async with Host() as host:
			host.send(_execute(1, "convert/produce"))
			await host.response(1)
			host.send(_execute(2, "convert/consume", [BindLink(generate_id("consume/level"), generate_id("count"), DataType.INTEGER)]))
			answer = await host.response(2)
			assert answer.id == OutputId.SUCCESS
			assert struct.unpack("<i", answer.configs[generate_id("seen")])[0] == 12
	asyncio.run(go())


def test_a_value_that_does_not_convert_goes_out_fallback_and_says_where():
	async def go():
		_Consume.ran = 0
		async with Host() as host:
			host.send(_execute(1, "convert/produce"))
			await host.response(1)
			level = generate_id("consume/level")
			host.send(_execute(2, "convert/consume", [BindLink(level, generate_id("reading"), DataType.INTEGER)]))
			answer = await host.response(2)

			assert answer.id == OutputId.FALLBACK
			assert _Consume.ran == 0
			line = next(line for line in host.logs if line.startswith("[Convert]"))
			assert line == "[Convert] instanceId=0x0000 configId=0x%04x expected integer, got str 'abc'" % level
	asyncio.run(go())
