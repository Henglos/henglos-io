# The WiFi component's Connect (packages/packages/components/WiFi), against a
# simulated radio: the `network` module the ESP32 port has, faked here.

import asyncio
import importlib
import json
import os
import sys
import time
import types

import pytest

from hio.sdk import SUCCESS, FALLBACK, generate_id
from hio.system.core.Context import ActionContext, PipelineContext
from hio.system.core.services.PacketCodec import Config, DataType

_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "packages", "components", "WiFi", "src")

STAT_IDLE, STAT_CONNECTING, STAT_NO_AP_FOUND, STAT_GOT_IP = 1000, 1001, 201, 1010


class _Radio:
	# One station: `around` is what a scan sees; connect() joins only when
	# given the BSSID — the ESP32 bug Connect works around ("no AP found" by name).
	instance = None

	def __init__(self, interface) -> None:
		self._active = False
		self.connected = False
		self.status_now = STAT_IDLE
		self.around = []
		self.calls = []
		_Radio.instance = self

	def active(self, on=None):
		if on is None:
			return self._active
		self._active = on

	def isconnected(self):
		return self.connected

	def disconnect(self):
		self.connected = False

	def scan(self):
		return list(self.around)

	def connect(self, ssid, key=None, *, bssid=None):
		self.calls.append((ssid, key, bssid))
		if bssid is not None and any(network[1] == bssid for network in self.around):
			self.connected = True
			self.status_now = STAT_GOT_IP
		else:
			self.status_now = STAT_NO_AP_FOUND

	def status(self, what=None):
		return -50 if what == "rssi" else self.status_now

	def ifconfig(self):
		return ("192.168.0.9", "", "", "")

	def config(self, key=None, **kwargs):
		if key in ("ssid", "essid"):
			return "Casa"
		if key == "mac":
			return b"\x01\x02\x03\x04\x05\x06"
		return None


@pytest.fixture
def connect(monkeypatch, tmp_path):
	network = types.ModuleType("network")
	network.STA_IF, network.AP_IF = 0, 1
	network.WLAN = _Radio
	network.STAT_NO_AP_FOUND = STAT_NO_AP_FOUND
	network.STAT_WRONG_PASSWORD = 202
	monkeypatch.setitem(sys.modules, "network", network)
	# MicroPython's time functions, in ms.
	monkeypatch.setattr(time, "ticks_ms", lambda: int(time.monotonic() * 1000), raising=False)
	monkeypatch.setattr(time, "ticks_add", lambda a, b: a + b, raising=False)
	monkeypatch.setattr(time, "ticks_diff", lambda a, b: a - b, raising=False)

	package = types.ModuleType("wifi_component")
	package.__path__ = [_SRC]
	monkeypatch.setitem(sys.modules, "wifi_component", package)
	for name in ("wifi_component.wlan", "wifi_component.connect"):
		sys.modules.pop(name, None)
	module = importlib.import_module("wifi_component.connect")

	secret = tmp_path / "wifi.json"
	secret.write_text(json.dumps({"ssid": "Casa ", "password": "segredo"}))   # a space pasted after the name

	def run(around):
		pipeline = PipelineContext(16)
		pipeline.merge(Config(generate_id("connect/network"), DataType.UINT_8, str(secret).encode(), True))
		pipeline.merge(Config(generate_id("connect/timeout"), DataType.FLOAT_32, b"\x00\x00\x7a\x44"))   # 1000 ms
		context = ActionContext(pipeline, {})
		radio = module.station()
		radio.around = around
		output = asyncio.run(module.ConnectAction().execute(context))
		return output, radio, {config.config_id: bytes(config.data) for config in context.results}

	return run


def test_it_joins_the_network_a_scan_finds_by_its_bssid(connect):
	output, radio, results = connect([(b"Casa", b"\xaa" * 6, 7, -60, 3, False)])
	assert output == SUCCESS
	assert radio.calls == [(b"Casa", "segredo", b"\xaa" * 6)]
	assert results[generate_id("reason")] == b""


def test_a_network_it_doesnt_see_goes_out_no_network(connect):
	output, radio, results = connect([])
	assert output == FALLBACK
	assert radio.calls == [("Casa ", "segredo", None)]
	assert results[generate_id("reason")] == b"no_network"
