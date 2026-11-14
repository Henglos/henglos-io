# The stored program: RECORD -> FINISH_RECORD -> STANDALONE -> playback through
# MainTask, ERASE_RECORD, and HIOSystem playing it on its own at boot — against
# a real ProgramStorage in a temp folder.

import asyncio

from support import LoopbackTransport, StubConfig, execute_frame, request_frame, take_responses

from henglosio.sdk import HIOAction, action
from henglosio.sdk.core.identifier import generate_id
from hio.system.HIOSystem import HIOSystem
from hio.system.core.packets.RecordPacket import RecordPacket
from hio.system.core.services.CommandIngress import CommandIngress
from hio.system.core.services.ControlPlane import ControlPlane
from hio.system.core.services.FrameReader import FrameReader
from hio.system.core.services.PacketCodec import CommandId, OutputId, OutputLink
from hio.system.core.services.ProgramStorage import ProgramStorage
from hio.system.core.tasks.MainTask import MainTask


# How many times the stored program ran x/count.
_counted = []


@action("x/count")
class _Count(HIOAction):
	async def execute(self, context):
		_counted.append(1)


def _config(tmp_path):
	class Config(StubConfig):
		PROGRAM_PATH = str(tmp_path).replace("\\", "/") + "/data/program.bin"
		COMPONENTS_DIR = str(tmp_path).replace("\\", "/") + "/components"
	return Config()


def _rig(tmp_path):
	config = _config(tmp_path)
	host = LoopbackTransport()
	ingress = CommandIngress([host], config)
	reader = FrameReader(ingress)
	storage = ProgramStorage(config.PROGRAM_PATH)
	control = ControlPlane(config, reader, storage)
	return host, storage, control, MainTask(ingress, reader, control, storage)


def _record(frame_id: int, action: str = "x/a") -> bytes:
	packet = RecordPacket(frame_id)
	packet.action_id = generate_id(action)
	return packet.encode()


def _answers(host):
	return [(r.frame_id, r.command_id, r.id) for r in take_responses(host)]


def test_record_finish_standalone_replays_in_a_loop(tmp_path):
	host, storage, control, task = _rig(tmp_path)

	def node(frame_id: int, action: str, instance: int, out: int = 0) -> bytes:
		packet = RecordPacket(frame_id)
		packet.action_id = generate_id(action)
		packet.instance_id = instance
		if out:
			packet.outputs = [OutputLink(OutputId.SUCCESS, out)]
		return packet.encode()

	async def go():
		host.send(node(1, "core/start", 1, out=2))
		await task.update()
		assert control.isRecording
		host.send(execute_frame(2, "x/count", instance_id=2))   # archived, not run
		await task.update()
		host.send(request_frame(3, CommandId.FINISH_RECORD))
		await task.update()
		assert not control.isRecording and not control.isPlaying
		assert _answers(host) == [
			(1, CommandId.RECORD, OutputId.SUCCESS),
			(2, CommandId.RECORD, OutputId.SUCCESS),
			(3, CommandId.FINISH_RECORD, OutputId.SUCCESS),
		]

		host.send(request_frame(4, CommandId.STANDALONE))
		assert await task.update()                   # STANDALONE + indexing the program
		assert control.isPlaying
		assert _answers(host) == [(4, CommandId.STANDALONE, OutputId.SUCCESS)]

		# Start -> x/count, then Start again (no mode: it loops) — in a task
		# of its own, run while the main loop sleeps.
		_counted.clear()
		for _ in range(10):
			await task.update()
			await asyncio.sleep(0.002)
		assert len(_counted) >= 2
		assert control.execute.cursor == 0           # the host's branch: untouched
		assert _answers(host) == []                  # program frames answer nobody

	asyncio.run(go())


def test_erase_stops_playback_and_drops_the_program(tmp_path):
	host, storage, control, task = _rig(tmp_path)

	async def go():
		host.send(_record(1))
		host.send(request_frame(2, CommandId.FINISH_RECORD))
		host.send(request_frame(3, CommandId.STANDALONE))
		for _ in range(3): await task.update()
		assert control.isPlaying and storage.size() > 0

		host.send(request_frame(4, CommandId.ERASE_RECORD))
		await task.update()
		assert not control.isPlaying and storage.size() == 0

	asyncio.run(go())


def test_record_stops_playback_and_starts_a_new_program(tmp_path):
	host, storage, control, task = _rig(tmp_path)

	async def go():
		host.send(_record(1))
		host.send(_record(2))
		host.send(request_frame(3, CommandId.FINISH_RECORD))
		host.send(request_frame(4, CommandId.STANDALONE))
		for _ in range(4): await task.update()
		two = storage.size()

		host.send(_record(5, "x/b"))
		await task.update()
		assert control.isRecording and not control.isPlaying
		assert storage.size() == two // 2

	asyncio.run(go())


def test_recording_an_action_the_board_doesnt_have_is_refused(tmp_path):
	# Otherwise the program would silently stop there at playback.
	host, storage, control, task = _rig(tmp_path)

	async def go():
		host.send(_record(1, "x/a"))
		host.send(_record(2, "not/installed"))
		for _ in range(2): await task.update()
		assert _answers(host) == [
			(1, CommandId.RECORD, OutputId.SUCCESS),
			(2, CommandId.RECORD, OutputId.ACTION_NOT_FOUND),
		]

	asyncio.run(go())


def test_execute_with_streams_is_not_recorded(tmp_path):
	host, storage, control, task = _rig(tmp_path)

	async def go():
		host.send(_record(1))
		host.send(execute_frame(2, "x/b", streams=[("data", 4)]))
		for _ in range(2): await task.update()
		assert _answers(host)[-1] == (2, CommandId.RECORD, OutputId.FALLBACK)

	asyncio.run(go())


def _started(monkeypatch, config) -> HIOSystem:
	# start() without its endless loop.
	monkeypatch.setattr(asyncio, "run", lambda coroutine: coroutine.close())
	system = HIOSystem([], config)
	system.initialize()
	system.start()
	return system


def test_boot_plays_a_stored_program(tmp_path, monkeypatch):
	config = _config(tmp_path)
	ProgramStorage(config.PROGRAM_PATH).write(_record(1))

	assert _started(monkeypatch, config).mainTask.controlPlane.isPlaying


def test_boot_without_a_program_stays_idle(tmp_path, monkeypatch):
	assert not _started(monkeypatch, _config(tmp_path)).mainTask.controlPlane.isPlaying
