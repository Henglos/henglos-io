# What the built-in tests (one file per module of hio/system/core/builtin)
# share: configs by name, EXECUTE / RUN frames, the output a frame went out
# on, a RECORD check, and an action that reads a variable back.

import json
import struct

from support import LoopbackTransport, StubConfig, take_responses

from henglosio.sdk import HIOAction, action
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.packets.RecordPacket import RecordPacket
from hio.system.core.packets.RunPacket import RunPacket
from hio.system.core.services.CommandIngress import CommandIngress
from hio.system.core.services.ControlPlane import ControlPlane
from hio.system.core.services.FrameReader import FrameReader
from hio.system.core.services.PacketCodec import Config, DataType
from hio.system.core.services.ProgramStorage import ProgramStorage
from hio.system.core.tasks.MainTask import MainTask


# --- configs ------------------------------------------------------------------

def text(config: str, value: str) -> Config:
	return Config(generate_id(config), DataType.STRING, value.encode())


def number(config: str, value: float) -> Config:
	return Config(generate_id(config), DataType.FLOAT, struct.pack("<f", value))


def integer(config: str, value: int) -> Config:
	return Config(generate_id(config), DataType.INTEGER, struct.pack("<i", value))


def boolean(config: str, value: bool) -> Config:
	return Config(generate_id(config), DataType.BOOL, b"\x01" if value else b"\x00")


def json_value(config: str, value) -> Config:
	kind = DataType.LIST if isinstance(value, list) else DataType.OBJECT
	return Config(generate_id(config), kind, json.dumps(value).encode())


def target(action_name: str, variable: str) -> Config:
	# A Variables action's "<action>/variable" config: which variable, by its VARIABLE_ID.
	return Config(generate_id(action_name + "/variable"), DataType.INTEGER, struct.pack("<i", variable_id(variable)))


def as_int(data: bytes) -> int:
	return struct.unpack("<i", data)[0]


# --- frames -------------------------------------------------------------------

def _fill(packet, action_name: str, configs, variables, codes, instance_id: int):
	packet.action_id = generate_id(action_name)
	packet.instance_id = instance_id
	packet.configs = list(configs)
	packet.variables = list(variables)
	packet.codes = list(codes)
	return packet.encode()


def execute(frame_id: int, action_name: str, configs=(), variables=(), codes=(), instance_id: int = 0) -> bytes:
	return _fill(ExecutePacket(frame_id), action_name, configs, variables, codes, instance_id)


def run(frame_id: int, action_name: str, configs=(), variables=(), codes=(), instance_id: int = 0) -> bytes:
	# RUN: the action on its own, outside the flow.
	return _fill(RunPacket(frame_id), action_name, configs, variables, codes, instance_id)


async def output(host, frame: bytes, frame_id: int) -> int:
	# The OUTPUT_ID `frame` went out on.
	host.send(frame)
	return (await host.response(frame_id)).id


def records(tmp_path, action_name: str) -> int:
	# What the board answers a RECORD of `action_name` with — it refuses an
	# action it doesn't have.
	import asyncio

	class Config_(StubConfig):
		PROGRAM_PATH = str(tmp_path).replace("\\", "/") + "/program.bin"
	config = Config_()
	link = LoopbackTransport()
	ingress = CommandIngress([link], config)
	reader = FrameReader(ingress)
	storage = ProgramStorage(config.PROGRAM_PATH)
	task = MainTask(ingress, reader, ControlPlane(config, reader, storage), storage)

	record = RecordPacket(1)
	record.action_id = generate_id(action_name)
	link.send(record.encode())
	asyncio.run(task.update())
	[response] = take_responses(link)
	return response.id


# --- reading a variable back --------------------------------------------------

@action("builtin test/read")
class _ReadVariable(HIOAction):
	# Publishes the variable named in "builtin test/read/name" as "value" —
	# nothing when it has none.
	async def execute(self, context):
		value = context.variable(context.get("builtin test/read/name"))
		if value is not None:
			context.set("value", value)
		return None


async def read_variable(host, frame_id: int, name: str) -> "bytes | None":
	# The variable's bytes as the board holds them, None when it has no value.
	host.send(execute(frame_id, "builtin test/read", [text("builtin test/read/name", name)]))
	return (await host.response(frame_id)).configs.get(generate_id("value"))
