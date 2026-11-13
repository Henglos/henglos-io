# RUN (COMMAND_ID 0x0C): one action on its own, outside the program's flow —
# the studio's ▶ on a node. Same body as EXECUTE; no INSTANCE_ID sequencing,
# the flow's position untouched, never archived while recording.

import asyncio
import struct

from support import Host, LoopbackTransport, StubConfig, execute_frame, take_responses

from hio.sdk import HIOAction, action
from hio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.packets.RecordPacket import RecordPacket
from hio.system.core.packets.RunPacket import RunPacket
from hio.system.core.services.CommandIngress import CommandIngress
from hio.system.core.services.ControlPlane import ControlPlane
from hio.system.core.services.FrameReader import FrameReader
from hio.system.core.services.PacketCodec import CommandId, Config, DataType, OutputId, OutputLink
from hio.system.core.services.ProgramStorage import ProgramStorage
from hio.system.core.tasks.MainTask import MainTask


@action("x/runme")
class _RunMe(HIOAction):
	# Publishes its own config and a variable, so a test sees what it ran with.
	async def execute(self, context):
		for name, key in (("got", "runme/value"), ("var", "count")):
			value = context.get(key)
			if value is not None:          # None isn't publishable
				context.set(name, value)
		return "done"


_INSTANCE_A = 0x0A0A
_INSTANCE_B = 0x0B0B


def _int(config_id: int, value: int) -> Config:
	return Config(config_id, DataType.INTEGER, struct.pack("<i", value))


def _run(frame_id: int, action_name: str, instance_id: int = _INSTANCE_B, configs=()) -> bytes:
	packet = RunPacket(frame_id)
	packet.action_id = generate_id(action_name)
	packet.instance_id = instance_id
	packet.configs = list(configs)
	return packet.encode()


def _start(frame_id: int, next_instance: int, **variables: int) -> bytes:
	packet = ExecutePacket(frame_id)
	packet.action_id = generate_id("core/start")
	packet.outputs = [OutputLink(OutputId.SUCCESS, next_instance)]
	packet.configs = [_int(variable_id(name), value) for name, value in variables.items()]
	return packet.encode()


def test_run_runs_an_action_the_flow_isnt_waiting_for_and_leaves_the_flow_alone():
	async def go():
		async with Host() as host:
			host.send(_start(1, _INSTANCE_A))          # the flow now expects instance A
			await host.response(1)

			host.send(_run(2, "x/runme", _INSTANCE_B, [_int(generate_id("runme/value"), 7)]))
			ran = await host.response(2)
			assert ran.command_id == CommandId.RUN
			assert ran.id == generate_id("done")       # its own output, as for an EXECUTE
			assert struct.unpack("<i", ran.configs[generate_id("got")])[0] == 7

			# The flow still waits for A: an EXECUTE of A runs…
			host.send(execute_frame(3, "x/runme", instance_id=_INSTANCE_A))
			assert (await host.response(3)).command_id == CommandId.EXECUTE

	asyncio.run(go())


def test_run_of_start_only_seeds_the_variables():
	async def go():
		async with Host() as host:
			host.send(_run(1, "core/start", 0, [_int(variable_id("count"), 5)]))
			assert (await host.response(1)).id == OutputId.SUCCESS

			host.send(_run(2, "x/runme"))
			assert struct.unpack("<i", (await host.response(2)).configs[generate_id("var")])[0] == 5

	asyncio.run(go())


def test_run_while_recording_runs_and_isnt_archived(tmp_path):
	class Config_(StubConfig):
		PROGRAM_PATH = str(tmp_path).replace("\\", "/") + "/program.bin"
	config = Config_()
	host = LoopbackTransport()
	ingress = CommandIngress([host], config)
	reader = FrameReader(ingress)
	storage = ProgramStorage(config.PROGRAM_PATH)
	control = ControlPlane(config, reader, storage)
	task = MainTask(ingress, reader, control, storage)

	record = RecordPacket(1)
	record.action_id = generate_id("x/runme")

	async def go():
		host.send(record.encode())                     # recording now
		await task.update()
		size = storage.size()
		host.send(_run(2, "x/runme"))
		await task.update()
		return size

	size = asyncio.run(go())
	assert control.isRecording
	answers = [(r.frame_id, r.command_id, r.id) for r in take_responses(host)]
	assert answers == [(1, CommandId.RECORD, OutputId.SUCCESS), (2, CommandId.RUN, generate_id("done"))]
	assert storage.size() == size                      # nothing added to the program
