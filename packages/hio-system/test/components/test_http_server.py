# The HTTP component's Request Trigger and Respond
# (packages/library/components/HTTP) — armed through the runtime's
# TriggerService, over a real socket on localhost.

import asyncio
import importlib
import json
import os
import socket
import struct
import sys
import threading
import types

import pytest

from henglosio.sdk import SUCCESS, FALLBACK, generate_id
from hio.system.core.Context import ActionContext, PipelineContext, decode_value
from hio.system.core.GlobalVariables import GlobalVariables
from hio.system.core.services.PacketCodec import Config, DataType, OutputId, OutputLink
from hio.system.core.services.TriggerService import TriggerService

_SRC = os.path.join(
	os.path.dirname(os.path.abspath(__file__)),
	"..", "..", "..", "library", "components", "HTTP", "src",
)

# The component as a package — its modules import each other relatively.
if "http_component" not in sys.modules:
	package = types.ModuleType("http_component")
	package.__path__ = [os.path.abspath(_SRC)]
	sys.modules["http_component"] = package

server = importlib.import_module("http_component.server")
request_trigger = importlib.import_module("http_component.request_trigger")
respond = importlib.import_module("http_component.respond")


def _free_port() -> int:
	with socket.socket() as probe:
		probe.bind(("127.0.0.1", 0))
		return probe.getsockname()[1]


def _text(name: str, value: str) -> Config:
	return Config(generate_id(name), DataType.STRING, value.encode())


def _number(name: str, value: float) -> Config:
	return Config(generate_id(name), DataType.FLOAT, struct.pack("<f", value))


class _Packet:
	def __init__(self, instance_id: int, configs) -> None:
		self.action_id = generate_id("http/request trigger")
		self.instance_id = instance_id
		self.outputs = [OutputLink(OutputId.SUCCESS, 99)]
		self.configs = configs


def _ask(port: int, raw: bytes, answers: list) -> threading.Thread:
	# A client in the background: sends `raw`, keeps the whole answer.
	def go():
		with socket.create_connection(("127.0.0.1", port), timeout=5) as client:
			client.sendall(raw)
			data = b""
			while True:
				chunk = client.recv(1024)
				if not chunk:
					break
				data += chunk
			answers.append(data)
	thread = threading.Thread(target=go)
	thread.start()
	return thread


def _poll_until(triggers: TriggerService, tries: int = 200):
	import time
	for _ in range(tries):
		fired = triggers.poll()
		if fired is not None:
			return fired
		time.sleep(0.01)
	raise AssertionError("the trigger never fired")


def _results(results) -> dict:
	return {result.config_id: decode_value(result) for result in results}


@pytest.fixture
def rig(tmp_path, monkeypatch):
	# The body folder without the drive: the component's paths start at "/".
	body_dir = str(tmp_path).replace("\\", "/").split(":", 1)[-1] + "/in"
	monkeypatch.setattr(server, "BODY_DIR", body_dir)
	port = _free_port()
	triggers = TriggerService(GlobalVariables(4))
	yield port, triggers
	triggers.disarm_all()
	server.current = None


def _arm(triggers, port, path="/webhook", method="ANY", pick=""):
	assert triggers.arm(_Packet(10, [
		_number("request trigger/port", port), _text("request trigger/path", path),
		_text("request trigger/method", method), _text("request trigger/pick", pick),
	])), triggers.lastError


def test_a_request_fires_it_and_respond_answers(rig):
	port, triggers = rig
	_arm(triggers, port, pick="sensor.temp")
	assert triggers.poll() is None                  # nobody asked yet (the port opens)

	body = json.dumps({"sensor": {"temp": 21.5}}).encode()
	answers = []
	client = _ask(port, b"POST /webhook?led=on HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\n\r\n%s" % (len(body), body), answers)

	instance_id, target, results = _poll_until(triggers)
	published = _results(results)
	assert (instance_id, target) == (10, 99)
	assert published[generate_id("method")] == "POST"
	assert published[generate_id("path")] == "/webhook"
	assert published[generate_id("query")] == {"led": "on"}
	assert published[generate_id("value")] == pytest.approx(21.5)
	assert published[generate_id("size")] == len(body)
	with open(published[generate_id("file")]) as file:
		assert json.load(file) == {"sensor": {"temp": 21.5}}

	# Respond, in its branch.
	pipeline = PipelineContext(16)
	pipeline.merge(_number("respond/status", 201))
	pipeline.merge(_text("respond/body", '{"ok": true}'))
	context = ActionContext(pipeline, {})
	action = respond.RespondAction()
	action.context = context
	assert asyncio.run(action.execute(context)) == SUCCESS

	client.join(5)
	head, _, answer = answers[0].partition(b"\r\n\r\n")
	assert head.startswith(b"HTTP/1.1 201") and b"application/json" in head
	assert answer == b'{"ok": true}'

	# Answered: a second Respond has nothing to answer.
	assert asyncio.run(action.execute(context)) == FALLBACK


def test_the_port_waits_for_a_network(rig, monkeypatch):
	# Played on its own, the board polls before Start's WiFi Connect ran.
	port, triggers = rig
	_arm(triggers, port)
	monkeypatch.setattr(server, "network_up", lambda: False)
	assert triggers.poll() is None
	assert port not in server._listeners

	monkeypatch.setattr(server, "network_up", lambda: True)
	assert triggers.poll() is None
	assert port in server._listeners


def test_a_branch_that_doesnt_answer_answers_200(rig):
	port, triggers = rig
	_arm(triggers, port)
	triggers.poll()
	answers = []
	client = _ask(port, b"GET /webhook HTTP/1.1\r\n\r\n", answers)
	instance_id, _, _ = _poll_until(triggers)

	triggers.finish(instance_id)
	client.join(5)
	assert answers[0].startswith(b"HTTP/1.1 200")
	assert server.current is None


@pytest.mark.parametrize("raw, status", [
	(b"GET /other HTTP/1.1\r\n\r\n", b"404"),
	(b"DELETE /webhook HTTP/1.1\r\n\r\n", b"405"),
])
def test_other_paths_and_methods_are_refused_without_firing(rig, raw, status):
	port, triggers = rig
	_arm(triggers, port, method="POST")
	triggers.poll()
	answers = []
	client = _ask(port, raw, answers)
	for _ in range(100):
		assert triggers.poll() is None
		if answers:
			break
		client.join(0.01)
	client.join(5)
	assert answers[0].split(b" ")[1] == status


def test_auth_header_is_required(rig, tmp_path):
	port, triggers = rig
	credential = tmp_path / "auth.json"
	credential.write_text(json.dumps({"header": "X-Key", "value": "s3cret"}))
	assert triggers.arm(_Packet(10, [
		_number("request trigger/port", port), _text("request trigger/path", "/webhook"),
		_text("request trigger/auth", str(credential)),
	]))
	triggers.poll()

	refused = []
	client = _ask(port, b"GET /webhook HTTP/1.1\r\n\r\n", refused)
	for _ in range(100):
		assert triggers.poll() is None
		if refused:
			break
		client.join(0.01)
	client.join(5)
	assert refused[0].startswith(b"HTTP/1.1 401")

	allowed = []
	_ask(port, b"GET /webhook HTTP/1.1\r\nX-Key: s3cret\r\n\r\n", allowed)
	instance_id, _, _ = _poll_until(triggers)
	triggers.finish(instance_id)


def test_respond_outside_a_request_branch_goes_fallback():
	server.current = None
	context = ActionContext(PipelineContext(4), {})
	action = respond.RespondAction()
	action.context = context
	assert asyncio.run(action.execute(context)) == FALLBACK


def test_the_path_is_a_base_path(rig):
	# /webhook takes what's under it too — and says what came after.
	port, triggers = rig
	_arm(triggers, port)
	triggers.poll()
	answers = []
	client = _ask(port, b"GET /webhook/led/on?x=1 HTTP/1.1\r\n\r\n", answers)
	instance_id, _, results = _poll_until(triggers)
	published = _results(results)
	assert published[generate_id("path")] == "/webhook/led/on"
	assert published[generate_id("subpath")] == "/led/on"
	assert published[generate_id("segments")] == ["led", "on"]
	triggers.finish(instance_id)
	client.join(5)


@pytest.mark.parametrize("raw", [b"GET /webhookx HTTP/1.1\r\n\r\n", b"GET /web HTTP/1.1\r\n\r\n"])
def test_a_base_path_goes_by_whole_segments(rig, raw):
	port, triggers = rig
	_arm(triggers, port)
	triggers.poll()
	answers = []
	client = _ask(port, raw, answers)
	for _ in range(100):
		assert triggers.poll() is None
		if answers:
			break
		client.join(0.01)
	client.join(5)
	assert answers[0].split(b" ")[1] == b"404"


def test_the_most_specific_base_path_takes_the_request(rig):
	port, triggers = rig
	_arm(triggers, port, path="/api")
	assert triggers.arm(_Packet(11, [
		_number("request trigger/port", port), _text("request trigger/path", "/api/led/"),
		_text("request trigger/method", "ANY"), _text("request trigger/pick", ""),
	])), triggers.lastError
	triggers.poll()
	answers = []
	client = _ask(port, b"GET /api/led/on HTTP/1.1\r\n\r\n", answers)
	instance_id, _, results = _poll_until(triggers)
	assert instance_id == 11
	assert _results(results)[generate_id("subpath")] == "/on"
	triggers.finish(instance_id)
	client.join(5)


def test_a_new_run_closes_the_port_the_last_one_left_open(rig):
	# A session stops main.py (Ctrl-C, no reset) and imports the components
	# afresh: the stored program's socket on the port is closed, not left
	# holding it (EADDRINUSE on the board — the session's trigger never fires).
	port, triggers = rig
	route = server.open_route(port, "ANY", "/webhook", None)
	stale = server._listeners[port].socket

	package = types.ModuleType("http_component_next_run")
	package.__path__ = [os.path.abspath(_SRC)]
	sys.modules["http_component_next_run"] = package
	try:
		fresh = importlib.import_module("http_component_next_run.server")
		assert stale.fileno() == -1                  # closed
		assert port not in fresh._listeners
		fresh.close_route(port, fresh.open_route(port, "ANY", "/webhook", None))
	finally:
		for name in [name for name in sys.modules if name.startswith("http_component_next_run")]:
			del sys.modules[name]
	assert route.waiting == []
