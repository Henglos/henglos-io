# Workflow variables end to end, through the real runtime: "core/start" seeds
# them, "variables/set" writes them, VARIABLE configs (VALUE_TYPE 0x04) and
# ctx.var() read them, and they outlive the run — only a new program clears them.

import asyncio
import struct

from support import Host, LoopbackTransport, StubConfig, take_responses

from hio.sdk import HIOAction, action
from hio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.packets.ActionBody import decode_action_body, encode_action_body
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.packets.RecordPacket import RecordPacket
from hio.system.core.services.CommandIngress import CommandIngress
from hio.system.core.services.ControlPlane import ControlPlane
from hio.system.core.services.FrameReader import FrameReader
from hio.system.core.services.PacketCodec import CodeLink, CommandId, Config, DataType, OutputId, PacketCodec, VariableLink
from hio.system.core.services.ProgramStorage import ProgramStorage
from hio.system.core.tasks.MainTask import MainTask


@action("x/read")
class _ReadAction(HIOAction):
	# Publishes what it saw: its VARIABLE-bound config and the variable itself.
	async def execute(self, context):
		context.set("seen", context.get("read/level"))
		context.set("direct", context.variable("count"))
		return None


def _int(name_id: int, value: int) -> Config:
	return Config(name_id, DataType.INT_32, struct.pack("<i", value))


def _execute(frame_id: int, action_name: str, configs=(), variables=(), codes=()) -> bytes:
	packet = ExecutePacket(frame_id)
	packet.action_id = generate_id(action_name)
	packet.configs = list(configs)
	packet.variables = list(variables)
	packet.codes = list(codes)
	return packet.encode()


def _start(frame_id: int, **initial: int) -> bytes:
	return _execute(frame_id, "core/start", [_int(variable_id(name), value) for name, value in initial.items()])


def _set(frame_id: int, name: str, value=None, variables=()) -> bytes:
	target = Config(generate_id("set/variable"), DataType.UINT_16, struct.pack("<H", variable_id(name)))
	configs = [target] + ([_int(generate_id("set/value"), value)] if value is not None else [])
	return _execute(frame_id, "variables/set", configs, variables)


def _read(frame_id: int) -> bytes:
	return _execute(frame_id, "x/read", variables=[VariableLink(generate_id("read/level"), variable_id("count"))])


def _int_of(data: bytes) -> int:
	return struct.unpack("<i", data)[0]


def test_variable_value_type_round_trips_through_the_action_body():
	packet = ExecutePacket(1)
	packet.action_id = generate_id("x/read")
	packet.variables = [VariableLink(0x1234, 0xBEEF)]
	payload = bytearray()
	encode_action_body(packet, payload)

	decoded = ExecutePacket(1)
	assert decode_action_body(decoded, memoryview(bytes(payload)))
	assert [(v.config_id, v.variable_id) for v in decoded.variables] == [(0x1234, 0xBEEF)]


def test_start_seeds_set_writes_and_configs_read():
	async def go():
		async with Host() as host:
			host.send(_start(1, count=5))
			assert (await host.response(1)).id == OutputId.SUCCESS

			host.send(_read(2))
			seen = await host.response(2)
			assert _int_of(seen.configs[generate_id("seen")]) == 5
			assert _int_of(seen.configs[generate_id("direct")]) == 5

			host.send(_set(3, "count", 42))
			assert (await host.response(3)).id == OutputId.SUCCESS

			host.send(_read(4))
			assert _int_of((await host.response(4)).configs[generate_id("seen")]) == 42

	asyncio.run(go())


def test_looping_back_to_start_keeps_what_the_program_wrote():
	async def go():
		async with Host() as host:
			host.send(_start(1, count=5))
			await host.response(1)
			host.send(_set(2, "count", 9))
			await host.response(2)

			host.send(_start(3, count=5))       # next loop: initial value not re-applied
			await host.response(3)
			host.send(_read(4))
			assert _int_of((await host.response(4)).configs[generate_id("seen")]) == 9

	asyncio.run(go())


def test_set_can_take_its_value_from_another_variable():
	async def go():
		async with Host() as host:
			host.send(_start(1, other=7))
			await host.response(1)
			host.send(_set(2, "count", variables=[VariableLink(generate_id("set/value"), variable_id("other"))]))
			assert (await host.response(2)).id == OutputId.SUCCESS
			host.send(_read(3))
			assert _int_of((await host.response(3)).configs[generate_id("seen")]) == 7

	asyncio.run(go())


def test_set_without_a_value_goes_out_fallback_and_reading_an_unset_variable_gives_nothing():
	async def go():
		async with Host() as host:
			host.send(_start(1))
			await host.response(1)
			host.send(_set(2, "count"))
			assert (await host.response(2)).id == OutputId.FALLBACK

			host.send(_read(3))
			response = await host.response(3)
			assert generate_id("seen") not in response.configs     # None isn't publishable

	asyncio.run(go())


def test_scripts_read_variables_with_ctx_var():
	async def go():
		async with Host() as host:
			host.send(_start(1, count=20))
			await host.response(1)

			# A CODE config computing read/level from the variable.
			code = CodeLink(generate_id("read/level"), DataType.INT_32, False, b'return ctx.var("COUNT") + 1')
			host.send(_execute(2, "x/read", codes=[code]))
			assert _int_of((await host.response(2)).configs[generate_id("seen")]) == 21

	asyncio.run(go())


def test_recording_accepts_set_and_keeps_its_variable_configs(tmp_path):
	# RECORD refuses actions the board doesn't have — "variables/set" is
	# built in — and the archived EXECUTE must still carry its VARIABLE links.
	class Config_(StubConfig):
		PROGRAM_PATH = str(tmp_path).replace("\\", "/") + "/program.bin"
	config = Config_()
	host = LoopbackTransport()
	ingress = CommandIngress([host], config)
	reader = FrameReader(ingress)
	storage = ProgramStorage(config.PROGRAM_PATH)
	task = MainTask(ingress, reader, ControlPlane(config, reader, storage), storage)

	record = RecordPacket(1)
	record.action_id = generate_id("variables/set")
	record.variables = [VariableLink(generate_id("set/value"), variable_id("other"))]

	async def go():
		host.send(record.encode())
		await task.update()

	asyncio.run(go())
	assert [r.id for r in take_responses(host)] == [OutputId.SUCCESS]

	storage.rewind()
	archived = PacketCodec.decode(storage.next())
	assert archived.action_id == generate_id("variables/set")
	assert [(v.config_id, v.variable_id) for v in archived.variables] == [(generate_id("set/value"), variable_id("other"))]


def test_a_text_variable_keeps_its_bytes():
	# A "text" variable's initial value is a UINT_8 array — scripts get bytes back.
	async def go():
		async with Host() as host:
			start = ExecutePacket(1)
			start.action_id = generate_id("core/start")
			start.configs = [Config(variable_id("greeting"), DataType.UINT_8, b"oi", True)]
			host.send(start.encode())
			await host.response(1)

			code = CodeLink(generate_id("read/level"), DataType.UINT_8, True, b'return ctx.var("greeting") + b"!"')
			host.send(_execute(2, "x/read", codes=[code]))
			assert (await host.response(2)).configs[generate_id("seen")] == b"oi!"

	asyncio.run(go())


@action("x/byname")
class _ByNameAction(HIOAction):
	# Reads a variable the same way it reads anything else — get() — then
	# tries to remove it.
	async def execute(self, context):
		context.set("got", context.get("count"))
		context.set("removed", context.remove("count"))
		return None


def test_get_reads_a_variable_by_name_and_remove_leaves_it_fixed():
	async def go():
		async with Host() as host:
			host.send(_start(1, count=3))
			await host.response(1)

			host.send(_execute(2, "x/byname"))
			first = await host.response(2)
			assert _int_of(first.configs[generate_id("got")]) == 3
			assert first.configs[generate_id("removed")] == b"\x00"     # nothing of the run to remove

			host.send(_execute(3, "x/byname"))                          # still there, next action and next run
			assert _int_of((await host.response(3)).configs[generate_id("got")]) == 3

	asyncio.run(go())


def test_a_value_of_the_run_wins_over_a_variable_of_the_same_name():
	async def go():
		async with Host() as host:
			host.send(_start(1, count=3))
			await host.response(1)

			# "count" published by the run (a literal config here) shadows the variable for get()...
			host.send(_execute(2, "x/byname", configs=[_int(generate_id("count"), 99)]))
			assert _int_of((await host.response(2)).configs[generate_id("got")]) == 99

			# ...but variable() still reaches the variable itself.
			host.send(_read(3))
			assert _int_of((await host.response(3)).configs[generate_id("direct")]) == 3

	asyncio.run(go())


def test_scripts_read_variables_with_ctx_get_too():
	async def go():
		async with Host() as host:
			host.send(_start(1, count=20))
			await host.response(1)
			code = CodeLink(generate_id("read/level"), DataType.INT_32, False, b'return ctx.get("count") * 2')
			host.send(_execute(2, "x/read", codes=[code]))
			assert _int_of((await host.response(2)).configs[generate_id("seen")]) == 40

	asyncio.run(go())


def test_set_takes_a_script_returning_a_bool():
	# RESULT TYPE AUTO (what an "any" config's script gets): `return not …`
	# stores True — not refused for not being Value's literal kind (int32).
	async def go():
		async with Host() as host:
			target = Config(generate_id("set/variable"), DataType.UINT_16, struct.pack("<H", variable_id("state")))
			code = CodeLink(generate_id("set/value"), DataType.AUTO, False, b'return not ctx.var("state")')
			host.send(_execute(1, "variables/set", [target], codes=[code]))
			assert (await host.response(1)).id == OutputId.SUCCESS

			host.send(_execute(2, "x/read", variables=[VariableLink(generate_id("read/level"), variable_id("state"))]))
			assert (await host.response(2)).configs[generate_id("seen")] == b"\x01"

	asyncio.run(go())
