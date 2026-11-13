# The IR component's Code Trigger (packages/library/components/IR) — armed
# through the runtime's TriggerService, its receiver's codes faked.

import importlib
import os
import struct
import sys
import types

import pytest

from hio.sdk import generate_id
from hio.system.core.Context import decode_value
from hio.system.core.GlobalVariables import GlobalVariables
from hio.system.core.services.PacketCodec import Config, DataType, OutputId, OutputLink
from hio.system.core.services.TriggerService import TriggerService

_SRC = os.path.join(
	os.path.dirname(os.path.abspath(__file__)),
	"..", "..", "..", "library", "components", "IR", "src",
)

if "ir_component" not in sys.modules:
	package = types.ModuleType("ir_component")
	package.__path__ = [os.path.abspath(_SRC)]
	sys.modules["ir_component"] = package

code_trigger = importlib.import_module("ir_component.code_trigger")


class _FakeReceiver:
	def __init__(self) -> None:
		self.codes = []

	def clear(self) -> None:
		self.codes.clear()

	def code(self):
		return self.codes.pop(0) if self.codes else None


class _Packet:
	def __init__(self, configs) -> None:
		self.action_id = generate_id("ir/code trigger")
		self.instance_id = 7
		self.outputs = [OutputLink(OutputId.SUCCESS, 8)]
		self.configs = configs


def _text(name: str, value: str) -> Config:
	return Config(generate_id(name), DataType.STRING, value.encode())


@pytest.fixture
def rx(monkeypatch):
	fake = _FakeReceiver()
	monkeypatch.setattr(code_trigger, "receiver", lambda pin: fake)
	return fake


def _arm(**configs):
	triggers = TriggerService(GlobalVariables(4))
	entries = [Config(generate_id("code trigger/rx pin"), DataType.INTEGER, struct.pack("<i", 27))]
	entries += [_text("code trigger/" + name, value) for name, value in configs.items()]
	assert triggers.arm(_Packet(entries)), triggers.lastError
	return triggers


def test_any_code_fires_it_with_receives_outputs(rx):
	triggers = _arm()
	assert triggers.poll() is None
	rx.codes.append(("nec", 0x00, 0x45, False))
	instance_id, target, results = triggers.poll()
	published = {result.config_id: decode_value(result) for result in results}
	assert (instance_id, target) == (7, 8)
	assert published[generate_id("code")] == "nec 0x00 0x45"
	assert published[generate_id("command")] == 0x45


def test_only_the_code_set_fires_it(rx):
	triggers = _arm(protocol="nec", command="0x45")
	rx.codes += [("nec", 0, 0x46, False), ("samsung", 7, 0x45, False)]
	assert triggers.poll() is None and triggers.poll() is None
	rx.codes.append(("nec", 0, 0x45, False))
	assert triggers.poll() is not None


def test_a_held_buttons_repeats_only_with_repeats_on(rx):
	triggers = _arm()
	rx.codes.append(("nec", 0, 0x45, True))
	assert triggers.poll() is None
