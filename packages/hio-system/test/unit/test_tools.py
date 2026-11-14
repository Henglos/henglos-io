# hio.tools: what a host drives the runtime with over the REPL — frames in as
# hex, frames out as hex between "<<" and ">>".

import re

import pytest

from support import StubConfig, request_frame

from henglosio.sdk.core.identifier import generate_id
from hio.system.SystemConfig import SystemConfig
from hio.system.core.packets.RecordPacket import RecordPacket
from hio.system.core.services.PacketCodec import CommandId, OutputId, StreamStatus
from hio.tools import repl
from hio.tools.frames import decode


@pytest.fixture(autouse=True)
def fresh(tmp_path, monkeypatch):
	# A runtime of its own per test, its program in a temp folder.
	monkeypatch.setattr(SystemConfig, "PROGRAM_PATH", str(tmp_path).replace("\\", "/") + "/program.bin")
	monkeypatch.setattr(SystemConfig, "COMPONENTS_DIR", str(tmp_path).replace("\\", "/") + "/components")
	monkeypatch.setattr(repl, "_system", None)


def _call(capsys, frames: bytes) -> list:
	repl.exchange(frames.hex())
	match = re.search(r"<<([0-9a-f]*)>>", capsys.readouterr().out)
	return [(r[1], r[2], r[3]) for r in decode(bytes.fromhex(match.group(1)))]


def _record(frame_id: int) -> bytes:
	packet = RecordPacket(frame_id)
	packet.action_id = generate_id("x/a")
	return packet.encode()


def test_get_version(capsys):
	assert _call(capsys, request_frame(1, CommandId.GET_VERSION)) == [(1, CommandId.GET_VERSION, OutputId.SUCCESS)]


def test_state_carries_over_between_calls(capsys):
	assert _call(capsys, _record(1)) == [(1, CommandId.RECORD, OutputId.SUCCESS)]
	assert repl._system.mainTask.controlPlane.isRecording
	assert _call(capsys, _record(2) + request_frame(3, CommandId.FINISH_RECORD)) == [
		(2, CommandId.RECORD, OutputId.SUCCESS),
		(3, CommandId.FINISH_RECORD, OutputId.SUCCESS),
	]
	assert repl._system.mainTask.programStorage.size() > 0


def test_a_burst_bigger_than_the_transport_buffer_gets_through(capsys):
	burst = b"".join(request_frame(10 + i, CommandId.GET_VERSION) for i in range(150))
	assert len(_call(capsys, burst)) == 150


def test_returns_while_a_program_plays(capsys):
	_call(capsys, _record(1) + request_frame(2, CommandId.FINISH_RECORD) + request_frame(3, CommandId.STANDALONE))
	assert repl._system.mainTask.controlPlane.isPlaying
	assert _call(capsys, request_frame(4, CommandId.STREAM, b"\x01\x00\x02\x00ab")) == [
		(4, CommandId.STREAM, StreamStatus.NOT_FOUND),
	]
