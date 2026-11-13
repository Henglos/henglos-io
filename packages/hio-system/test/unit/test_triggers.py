# Triggers: arming them with EXECUTE, TRIGGER_POLL, the branch they start
# (and finish), the built-in Timer and Pin, and the stored program playing by
# INSTANCE_ID — Start, triggers and jumps back.

import asyncio
import struct

import machine

from support import LoopbackTransport, StubConfig, request_frame, take_responses

from hio.sdk import HIOAction, HIOTrigger, action, trigger
from hio.sdk.core.identifier import generate_id
from hio.system.core.Context import encode_value
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.packets.RecordPacket import RecordPacket
from hio.system.core.services.CommandIngress import CommandIngress
from hio.system.core.services.ControlPlane import ControlPlane
from hio.system.core.services.FrameReader import FrameReader
from hio.system.core.services.PacketCodec import CommandId, OutputId, OutputLink
from hio.system.core.services.ProgramStorage import ProgramStorage
from hio.system.core.tasks.MainTask import MainTask


# What ran, in order: the INSTANCE_ID-free names of the actions below.
_ran = []


@action("trace/one")
class _One(HIOAction):
	async def execute(self, context):
		_ran.append(("one", context.get("value")))


@action("trace/two")
class _Two(HIOAction):
	async def execute(self, context):
		_ran.append(("two", context.get("value")))


# A trigger the test fires by hand: `pending` set -> next poll() fires.
@trigger("trace/manual")
class _Manual(HIOTrigger):
	instances = []

	def initialize(self) -> None:
		self.pending = None
		self.finished = 0
		self.disarmed = False
		_Manual.instances.append(self)

	def poll(self, context) -> bool:
		if self.pending is None:
			return False
		context.set("value", self.pending)
		self.pending = None
		return True

	def finish(self, context) -> None:
		self.finished += 1

	def disarm(self) -> None:
		self.disarmed = True


def _node(packet_class, frame_id: int, name: str, instance: int, out: int = 0, configs=(), outputs=None):
	packet = packet_class(frame_id)
	packet.action_id = generate_id(name)
	packet.instance_id = instance
	if outputs is not None:
		packet.outputs = [OutputLink(output_id, target) for output_id, target in outputs]
	elif out:
		packet.outputs = [OutputLink(OutputId.SUCCESS, out)]
	packet.configs = [encode_value(generate_id(key), value) for key, value in configs]
	return packet.encode()


def _poll(frame_id: int, wait_ms: int = 0) -> bytes:
	return request_frame(frame_id, CommandId.TRIGGER_POLL, struct.pack("<H", wait_ms))


def _rig(tmp_path=None):
	class Config(StubConfig):
		PROGRAM_PATH = (str(tmp_path).replace("\\", "/") + "/data/program.bin") if tmp_path else "/nowhere/program.bin"
	config = Config()
	host = LoopbackTransport()
	ingress = CommandIngress([host], config)
	reader = FrameReader(ingress)
	storage = ProgramStorage(config.PROGRAM_PATH) if tmp_path else None
	control = ControlPlane(config, reader, storage)
	return host, control, MainTask(ingress, reader, control, storage)


async def _send(host, task, *frames):
	for frame in frames:
		host.send(frame)
		await task.update()
	return [(r.frame_id, r.command_id, r.id, r.configs) for r in take_responses(host)]


def setup_function():
	_ran.clear()
	_Manual.instances.clear()
	machine.Pin.reset()


# --- host-driven: EXECUTE arms, TRIGGER_POLL fires

def test_execute_of_a_trigger_arms_it_without_moving_the_flow():
	host, control, task = _rig()

	async def go():
		answers = await _send(host, task, _node(ExecutePacket, 1, "trace/manual", 10, out=11))
		assert [a[:3] for a in answers] == [(1, CommandId.EXECUTE, OutputId.SUCCESS)]
		assert control.execute.cursor == 0
		assert control.execute.triggers.armed() == 1

	asyncio.run(go())


def test_trigger_poll_answers_none_then_the_trigger_that_fired():
	host, control, task = _rig()

	async def go():
		await _send(host, task, _node(ExecutePacket, 1, "trace/manual", 10, out=11))

		assert [a[:3] for a in await _send(host, task, _poll(2))] == [(2, CommandId.TRIGGER_POLL, 0)]

		_Manual.instances[0].pending = 7
		(answer,) = await _send(host, task, _poll(3))
		assert answer[:3] == (3, CommandId.TRIGGER_POLL, 10)
		assert answer[3][generate_id("value")] == struct.pack("<i", 7)
		assert control.execute.cursor == 11

		# The branch: its first action reads what the trigger published.
		await _send(host, task, _node(ExecutePacket, 4, "trace/one", 11))
		assert _ran == [("one", 7)]
		assert _Manual.instances[0].finished == 1      # nothing after it: branch over
		assert control.execute.cursor == 0

	asyncio.run(go())


def test_trigger_poll_waits_for_an_event():
	host, control, task = _rig()

	async def go():
		await _send(host, task, _node(ExecutePacket, 1, "trace/manual", 10, out=11))

		async def later():
			await asyncio.sleep(0.03)
			_Manual.instances[0].pending = 1

		asyncio.create_task(later())
		(answer,) = await _send(host, task, _poll(2, wait_ms=2000))
		assert answer[:3] == (2, CommandId.TRIGGER_POLL, 10)

	asyncio.run(go())


def test_rearming_with_the_same_configs_keeps_the_trigger():
	host, control, task = _rig()

	async def go():
		await _send(host, task, _node(ExecutePacket, 1, "trace/manual", 10, out=11, configs=[("manual/x", 1)]))
		await _send(host, task, _node(ExecutePacket, 2, "trace/manual", 10, out=12, configs=[("manual/x", 1)]))
		assert len(_Manual.instances) == 1

		await _send(host, task, _node(ExecutePacket, 3, "trace/manual", 10, out=12, configs=[("manual/x", 2)]))
		assert len(_Manual.instances) == 2 and _Manual.instances[0].disarmed

		_Manual.instances[1].pending = 1
		(answer,) = await _send(host, task, _poll(4))
		assert answer[2] == 10 and control.execute.cursor == 12

	asyncio.run(go())


def test_start_or_a_poll_ends_a_branch_left_half_way():
	host, control, task = _rig()

	async def go():
		await _send(host, task, _node(ExecutePacket, 1, "trace/manual", 10, out=11))
		_Manual.instances[0].pending = 1
		await _send(host, task, _poll(2))
		assert control.execute.cursor == 11

		await _send(host, task, _poll(3))               # the host walked away
		assert _Manual.instances[0].finished == 1
		assert control.execute.cursor == 0

	asyncio.run(go())


@action("trace/probe")
class _Probe(HIOAction):
	async def execute(self, context):
		_ran.append(("probe", context.get("probe/x")))


def test_a_branch_starts_with_an_empty_pipeline():
	# What an earlier branch published fills the pipeline up — the next one's
	# configs must still fit (an HTTP Respond's body went missing).
	host, control, task = _rig()

	async def go():
		await _send(host, task, _node(ExecutePacket, 1, "trace/manual", 10, out=11))
		_Manual.instances[0].pending = 1
		await _send(host, task, _poll(2))
		filler = [("filler/%d" % index, index) for index in range(15)]
		await _send(host, task, _node(ExecutePacket, 3, "trace/one", 11, configs=filler))

		_Manual.instances[0].pending = 2
		await _send(host, task, _poll(4))
		await _send(host, task, _node(ExecutePacket, 5, "trace/probe", 11, configs=[("probe/x", 9)]))
		assert _ran[-1] == ("probe", 9)

	asyncio.run(go())


def test_triggers_take_turns():
	host, control, task = _rig()

	async def go():
		await _send(host, task,
			_node(ExecutePacket, 1, "trace/manual", 10, out=11),
			_node(ExecutePacket, 2, "trace/manual", 20, out=21))
		first, second = _Manual.instances

		fired = []
		for frame_id in range(3, 7):
			first.pending = second.pending = 1
			(answer,) = await _send(host, task, _poll(frame_id))
			fired.append(answer[2])
			control.execute.abandon()
		assert fired == [10, 20, 10, 20]

	asyncio.run(go())


# --- the stored program

async def _spin(task, times: int) -> None:
	# The main loop `times` times round — the program's branches are tasks
	# of their own: they run while it sleeps.
	for _ in range(times):
		await task.update()
		await asyncio.sleep(0.002)


def _program(host, task, *nodes):
	frames = [_node(RecordPacket, index + 1, *node[0], **node[1]) for index, node in enumerate(nodes)]
	frames.append(request_frame(len(frames) + 1, CommandId.FINISH_RECORD))
	frames.append(request_frame(len(frames) + 1, CommandId.STANDALONE))
	return _send(host, task, *frames)


def test_playback_runs_start_once_then_answers_triggers(tmp_path):
	host, control, task = _rig(tmp_path)

	async def go():
		answers = await _program(host, task,
			(("core/start", 1), dict(out=2, configs=[("start/mode", b"once")])),
			(("trace/one", 2), {}),
			(("trace/manual", 10), dict(out=11)),
			(("trace/two", 11), {}),
		)
		assert all(a[2] == OutputId.SUCCESS for a in answers)

		await _spin(task, 10)
		assert _ran == [("one", None)]                 # Start ran once
		assert len(_Manual.instances) == 1             # the trigger was armed

		_Manual.instances[0].pending = 5
		await _spin(task, 10)
		assert _ran == [("one", None), ("two", 5)]
		assert _Manual.instances[0].finished == 1

	asyncio.run(go())


def test_playback_follows_a_jump_back(tmp_path):
	# Start -> Repeat(2) --loop--> one -> Repeat; --done--> two: a node wired
	# back to one recorded before it.
	host, control, task = _rig(tmp_path)

	async def go():
		await _program(host, task,
			(("core/start", 1), dict(out=2, configs=[("start/mode", b"once")])),
			(("logic/repeat", 2), dict(configs=[("repeat/times", 2)],
				outputs=[(generate_id("loop"), 3), (generate_id("done"), 4)])),
			(("trace/one", 3), dict(out=2)),
			(("trace/two", 4), {}),
		)
		await _spin(task, 20)
		assert [name for name, _ in _ran] == ["one", "one", "two"]

	asyncio.run(go())


def test_playback_loops_start(tmp_path):
	host, control, task = _rig(tmp_path)

	async def go():
		await _program(host, task,
			(("core/start", 1), dict(out=2, configs=[("start/mode", b"loop")])),
			(("trace/one", 2), {}),
		)
		await _spin(task, 9)
		assert len(_ran) >= 3

	asyncio.run(go())


@action("trace/slow")
class _Slow(HIOAction):
	# Waits until the test lets it go — a Delay, a long request.
	release = None

	async def execute(self, context):
		_ran.append(("slow start", None))
		while not _Slow.release:
			await asyncio.sleep(0.001)
		_ran.append(("slow end", None))


def test_playback_runs_a_triggers_branch_while_starts_waits(tmp_path):
	# Start's branch is held in a waiting action: a trigger that fires
	# meanwhile runs its own branch — with its own pipeline — right away.
	host, control, task = _rig(tmp_path)
	_Slow.release = False

	async def go():
		await _program(host, task,
			(("core/start", 1), dict(out=2, configs=[("start/mode", b"loop")])),
			(("trace/slow", 2), dict(configs=[("value", 1)])),
			(("trace/manual", 10), dict(out=11)),
			(("trace/two", 11), {}),
		)
		await _spin(task, 5)
		assert _ran == [("slow start", None)]

		_Manual.instances[0].pending = 5
		await _spin(task, 5)
		assert _ran == [("slow start", None), ("two", 5)]
		assert _Manual.instances[0].finished == 1

		# Fires again while Start still waits.
		_Manual.instances[0].pending = 6
		await _spin(task, 5)
		assert _ran[-1] == ("two", 6)

		_Slow.release = True
		await _spin(task, 5)
		assert ("slow end", None) in _ran

	asyncio.run(go())


def test_a_trigger_fires_again_only_once_its_branch_is_over(tmp_path):
	host, control, task = _rig(tmp_path)
	_Slow.release = False

	async def go():
		await _program(host, task,
			(("core/start", 1), dict(configs=[("start/mode", b"once")])),
			(("trace/manual", 10), dict(out=11)),
			(("trace/slow", 11), {}),
		)
		await _spin(task, 3)
		_Manual.instances[0].pending = 1
		await _spin(task, 5)
		_Manual.instances[0].pending = 2
		await _spin(task, 5)
		assert _ran == [("slow start", None)]        # the second waits in the trigger
		assert _Manual.instances[0].pending == 2

		_Slow.release = True
		await _spin(task, 5)
		assert _ran.count(("slow start", None)) == 2

	asyncio.run(go())
