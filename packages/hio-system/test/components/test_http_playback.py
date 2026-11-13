# The HTTP Request Trigger + Respond in a stored program played by the board
# on its own (MainTask) — next to a Start that loops.

import asyncio
import os
import socket
import sys
import threading

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "unit"))

from test_triggers import _Slow, _program, _rig, _spin  # noqa: E402
from test_http_server import server, request_trigger, respond, _free_port  # noqa: E402,F401


@pytest.fixture
def body_dir(tmp_path, monkeypatch):
	monkeypatch.setattr(server, "BODY_DIR", str(tmp_path).replace("\\", "/").split(":", 1)[-1] + "/in")


@pytest.mark.parametrize("mode", [b"loop", b"once", b"busy"])
def test_a_request_runs_its_branch_while_start_loops(tmp_path, body_dir, mode):
	# "busy": Start's branch held in a waiting action the whole time.
	host, control, task = _rig(tmp_path)
	port = _free_port()
	answers = []

	def ask():
		with socket.create_connection(("127.0.0.1", port), timeout=5) as client:
			client.sendall(b"GET /webhook HTTP/1.1\r\n\r\n")
			data = b""
			while True:
				chunk = client.recv(1024)
				if not chunk:
					break
				data += chunk
			answers.append(data)

	_Slow.release = False

	async def go():
		await _program(host, task,
			(("core/start", 1), dict(out=2, configs=[("start/mode", b"loop" if mode == b"busy" else mode)])),
			(("trace/slow" if mode == b"busy" else "trace/one", 2), {}),
			(("http/request trigger", 10), dict(out=11, configs=[
				("request trigger/port", float(port)), ("request trigger/path", b"/webhook"),
				("request trigger/method", b"ANY"),
			])),
			(("http/respond", 11), dict(configs=[("respond/status", 201.0), ("respond/body", b"hello")])),
		)
		await _spin(task, 10)
		client = threading.Thread(target=ask)
		client.start()
		for _ in range(300):
			await task.update()
			await asyncio.sleep(0.005)
			if answers:
				break
		client.join(5)

	asyncio.run(go())
	_Slow.release = True
	control.execute.triggers.disarm_all()
	server.current = None
	assert answers and answers[0].startswith(b"HTTP/1.1 201") and answers[0].endswith(b"hello"), answers
