# Pass Context: what an action hands the next one — only what it published,
# or (its EXECUTE carrying the "context/pass" flag) everything it was handed too.

import asyncio
import struct

from support import Host

from henglosio.sdk import HIOAction, action
from henglosio.sdk.core.identifier import generate_id
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.services.PacketCodec import BindLink, Config, DataType

_PASS = Config(generate_id("context/pass"), DataType.BOOL, b"\x01")


@action("pass/produce")
class _Produce(HIOAction):
	async def execute(self, context):
		context.set("reading", 10)
		return None


@action("pass/middle")
class _Middle(HIOAction):
	async def execute(self, context):
		context.set("middle", 1)
		# The flag never reaches the action as a value.
		context.set("flag seen", context.get("context/pass") is not None)
		return None


@action("pass/consume")
class _Consume(HIOAction):
	async def execute(self, context):
		value = context.get("consume/input")
		context.set("seen", -1 if value is None else value)
		return None


def _execute(frame_id: int, name: str, binds=(), configs=()) -> bytes:
	packet = ExecutePacket(frame_id)
	packet.action_id = generate_id(name)
	packet.binds = list(binds)
	packet.configs = list(configs)
	return packet.encode()


def _seen(passes: bool):
	answers = {}

	async def go():
		async with Host() as host:
			host.send(_execute(1, "pass/produce"))
			await host.response(1)
			host.send(_execute(2, "pass/middle", configs=[_PASS] if passes else []))
			answers["middle"] = await host.response(2)
			host.send(_execute(3, "pass/consume", [BindLink(generate_id("consume/input"), generate_id("reading"))]))
			answers["consume"] = await host.response(3)

	asyncio.run(go())
	return answers


def test_an_action_hands_on_only_what_it_published():
	answers = _seen(passes=False)
	assert struct.unpack("<i", answers["consume"].configs[generate_id("seen")])[0] == -1


def test_pass_context_hands_on_what_it_was_handed_too():
	answers = _seen(passes=True)
	assert struct.unpack("<i", answers["consume"].configs[generate_id("seen")])[0] == 10
	assert answers["middle"].configs[generate_id("flag seen")] == b"\x00"
