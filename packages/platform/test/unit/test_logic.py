# The built-in Logic actions end to end, through the real runtime: "logic/if"
# and "logic/switch" go out the output their condition picks, "logic/repeat"
# counts its loops — and their operands come typed (a bind, a variable) or as
# text (a typed-in "string" config), compared as numbers when both are.

import asyncio
import struct

from support import Host, LoopbackTransport, StubConfig, take_responses

from hio.sdk.core.identifier import generate_id, variable_id
from hio.system.core import Logic
from hio.system.core.packets.ExecutePacket import ExecutePacket
from hio.system.core.packets.RecordPacket import RecordPacket
from hio.system.core.services.CommandIngress import CommandIngress
from hio.system.core.services.ControlPlane import ControlPlane
from hio.system.core.services.FrameReader import FrameReader
from hio.system.core.services.PacketCodec import Config, DataType, OutputId, VariableLink
from hio.system.core.services.ProgramStorage import ProgramStorage
from hio.system.core.tasks.MainTask import MainTask


def _text(config: str, value: str) -> Config:
	return Config(generate_id(config), DataType.UINT_8, value.encode(), True)


def _float(config: str, value: float) -> Config:
	return Config(generate_id(config), DataType.FLOAT_32, struct.pack("<f", value))


def _execute(frame_id: int, action_name: str, configs=(), variables=(), instance_id: int = 0) -> bytes:
	packet = ExecutePacket(frame_id)
	packet.action_id = generate_id(action_name)
	packet.instance_id = instance_id
	packet.configs = list(configs)
	packet.variables = list(variables)
	return packet.encode()


def _if(frame_id: int, value, condition: str, compare=None, **second) -> bytes:
	configs = [value, _text("if/condition", condition)]
	if compare is not None:
		configs.append(compare)
	configs.extend(second.values())
	return _execute(frame_id, "logic/if", configs)


async def _output(host, frame: bytes, frame_id: int) -> int:
	host.send(frame)
	return (await host.response(frame_id)).id


# --- conditions ---------------------------------------------------------------

def test_numbers_compare_as_numbers_whatever_side_is_text():
	assert Logic.evaluate("eq", 10.0, b"10")
	assert Logic.evaluate("lt", b"9", b"10")              # not "9" > "10" as text
	assert Logic.evaluate("gte", 0.1000000015, b"0.1")    # a float32 round trip still equals
	assert not Logic.evaluate("gt", b"abc", b"1")          # not a number: no ordering


def test_text_compares_as_text():
	assert Logic.evaluate("eq", b"on", b"on")
	assert Logic.evaluate("ne", b"on", b"off")
	assert Logic.evaluate("contains", b"hello world", b"lo w")
	assert Logic.evaluate("not_contains", b"hello", b"x")
	assert Logic.evaluate("starts_with", b"GPIO12", b"GPIO")
	assert Logic.evaluate("ends_with", b"GPIO12", b"12")


def test_unary_conditions_and_missing_operands():
	assert Logic.evaluate("is_true", True)
	assert Logic.evaluate("is_true", b"on")
	assert Logic.evaluate("is_false", 0)
	assert not Logic.evaluate("is_false", None)           # missing isn't false, it's empty
	assert Logic.evaluate("is_empty", None)
	assert Logic.evaluate("is_empty", b"")
	assert Logic.evaluate("is_not_empty", 0)
	assert not Logic.evaluate("eq", None, b"")            # a missing operand fails every comparison
	assert not Logic.evaluate("nope", 1, 1)


# --- If -------------------------------------------------------------------------

def test_if_goes_out_true_or_false():
	async def go():
		async with Host() as host:
			assert await _output(host, _if(1, _float("if/value", 25.5), "gt", _text("if/compare to", "20")), 1) == generate_id("true")
			assert await _output(host, _if(2, _float("if/value", 15.0), "gt", _text("if/compare to", "20")), 2) == generate_id("false")
			assert await _output(host, _if(3, _text("if/value", "on"), "is_true"), 3) == generate_id("true")

	asyncio.run(go())


def test_if_combines_two_conditions():
	def frame(frame_id, combine, second_value):
		return _if(
			frame_id, _float("if/value", 5.0), "gt", _text("if/compare to", "1"),
			combine=_text("if/combine", combine),
			value2=_float("if/value 2", second_value),
			condition2=_text("if/condition 2", "lt"),
			compare2=_text("if/compare to 2", "3"),
		)

	async def go():
		async with Host() as host:
			assert await _output(host, frame(1, "and", 9.0), 1) == generate_id("false")   # 5 > 1, 9 < 3 doesn't
			assert await _output(host, frame(2, "or", 9.0), 2) == generate_id("true")
			assert await _output(host, frame(3, "and", 2.0), 3) == generate_id("true")
			assert await _output(host, frame(4, "none", 9.0), 4) == generate_id("true")   # the second is ignored

	asyncio.run(go())


def test_if_reads_a_variable():
	async def go():
		async with Host() as host:
			start = ExecutePacket(1)
			start.action_id = generate_id("core/start")
			start.configs = [Config(variable_id("mode"), DataType.UINT_8, b"auto", True)]
			host.send(start.encode())
			await host.response(1)

			frame = _execute(2, "logic/if",
				[_text("if/condition", "eq"), _text("if/compare to", "auto")],
				[VariableLink(generate_id("if/value"), variable_id("mode"))])
			assert await _output(host, frame, 2) == generate_id("true")

	asyncio.run(go())


# --- Switch ---------------------------------------------------------------------

def _switch(frame_id: int, value, *cases, match: str = "eq") -> bytes:
	configs = [value, _text("switch/match", match)]
	configs.extend(_text("switch/case %d" % (index + 1), case) for index, case in enumerate(cases) if case is not None)
	return _execute(frame_id, "logic/switch", configs)


def test_switch_goes_out_the_first_case_that_matches():
	async def go():
		async with Host() as host:
			assert await _output(host, _switch(1, _float("switch/value", 2.0), "1", "2", "2"), 1) == generate_id("case_2")
			assert await _output(host, _switch(2, _text("switch/value", "blue"), "red", "green"), 2) == generate_id("otherwise")
			assert await _output(host, _switch(3, _float("switch/value", 70.0), "90", "50", match="gt"), 3) == generate_id("case_2")

	asyncio.run(go())


def test_an_empty_or_unsent_case_never_matches_not_even_another_switchs():
	async def go():
		async with Host() as host:
			assert await _output(host, _switch(1, _text("switch/value", "x"), "", None, "x"), 1) == generate_id("case_3")
			# Same config ids, this node has no Case 3: the last node's "x" mustn't linger.
			assert await _output(host, _switch(2, _text("switch/value", "x"), "a", "b"), 2) == generate_id("otherwise")

	asyncio.run(go())


# --- Repeat ---------------------------------------------------------------------

def test_repeat_loops_its_times_then_done_and_starts_over():
	async def go():
		async with Host() as host:
			def repeat(frame_id):
				return _execute(frame_id, "logic/repeat", [_text("repeat/times", "2")], instance_id=0)

			seen = []
			for frame_id in range(1, 5):
				host.send(repeat(frame_id))
				response = await host.response(frame_id)
				iteration = response.configs.get(generate_id("iteration"))
				seen.append((response.id, None if iteration is None else struct.unpack("<i", iteration)[0]))

			assert seen == [
				(generate_id("loop"), 1),
				(generate_id("loop"), 2),
				(generate_id("done"), None),
				(generate_id("loop"), 1),     # Done reset it
			]

	asyncio.run(go())


def test_repeat_of_zero_goes_straight_to_done():
	async def go():
		async with Host() as host:
			assert await _output(host, _execute(1, "logic/repeat", [_float("repeat/times", 0.0)]), 1) == generate_id("done")

	asyncio.run(go())


# --- recording -------------------------------------------------------------------

def test_recording_accepts_the_logic_actions(tmp_path):
	# RECORD refuses actions the board doesn't have — Logic's are built in.
	class Config_(StubConfig):
		PROGRAM_PATH = str(tmp_path).replace("\\", "/") + "/program.bin"
	config = Config_()
	host = LoopbackTransport()
	ingress = CommandIngress([host], config)
	reader = FrameReader(ingress)
	storage = ProgramStorage(config.PROGRAM_PATH)
	task = MainTask(ingress, reader, ControlPlane(config, reader, storage), storage)

	async def go():
		for frame_id, name in enumerate(("logic/if", "logic/switch", "logic/repeat"), start=1):
			record = RecordPacket(frame_id)
			record.action_id = generate_id(name)
			host.send(record.encode())
			await task.update()

	asyncio.run(go())
	assert [r.id for r in take_responses(host)] == [OutputId.SUCCESS] * 3


# --- a CODE operand ------------------------------------------------------------

from hio.sdk import HIOAction, action                          # noqa: E402
from hio.system.core.services.PacketCodec import CodeLink      # noqa: E402


@action("x/status")
class _Status(HIOAction):
	async def execute(self, context):
		context.set("result", {"status": 200, "body": "ok"})
		return None


def test_a_number_a_script_returns_into_a_text_operand_compares_as_one():
	# If's Value is a "string" config: `return ctx.get("result")["status"]`
	# hands it 200 — "200" — not an error that leaves it empty (and False).
	async def go():
		async with Host() as host:
			host.send(_execute(1, "x/status"))
			await host.response(1)
			packet = ExecutePacket(2)
			packet.action_id = generate_id("logic/if")
			packet.configs = [_text("if/condition", "eq"), _text("if/compare to", "200")]
			packet.codes = [CodeLink(generate_id("if/value"), DataType.UINT_8, True, b'return ctx.get("result")["status"]')]
			assert await _output(host, packet.encode(), 2) == generate_id("true")

	asyncio.run(go())


def test_a_logic_operand_from_code_keeps_the_type_it_was_returned_as():
	# RESULT TYPE AUTO (what Logic's operands get): 200 stays an int, True a
	# bool, a dict its JSON — not their text.
	from hio.system.core.Context import PipelineContext, ScriptContext
	from hio.system.core.GlobalVariables import GlobalVariables
	from hio.system.core.services.ScriptEngine import ScriptEngine

	engine = ScriptEngine(4)
	context = ScriptContext(PipelineContext(4), GlobalVariables(0))
	typed = lambda source: engine.evaluate(CodeLink(generate_id("if/value"), DataType.AUTO, False, source), context)

	assert (typed(b"return 200").data_type, struct.unpack("<i", typed(b"return 200").data)[0]) == (DataType.INT_32, 200)
	assert typed(b"return 2.5").data_type == DataType.FLOAT_32
	assert (typed(b"return True").data_type, bytes(typed(b"return True").data)) == (DataType.BOOL, b"\x01")
	assert (typed(b'return "ok"').data_type, typed(b'return "ok"').is_array) == (DataType.UINT_8, True)
	assert typed(b'return {"a": 1}').data_type == DataType.JSON


def test_is_greater_than_compares_a_returned_number_as_a_number():
	async def go():
		async with Host() as host:
			host.send(_execute(1, "x/status"))
			await host.response(1)
			packet = ExecutePacket(2)
			packet.action_id = generate_id("logic/if")
			packet.configs = [_text("if/condition", "gt"), _text("if/compare to", "150")]
			packet.codes = [CodeLink(generate_id("if/value"), DataType.AUTO, False, b'return ctx.get("result")["status"]')]
			assert await _output(host, packet.encode(), 2) == generate_id("true")

	asyncio.run(go())


def test_a_switch_goes_out_a_case_added_past_the_third():
	# Cases added in the studio (Case 4, 5…) go out their own output.
	async def go():
		async with Host() as host:
			configs = [_text("switch/value", "e"), _text("switch/match", "eq")]
			configs += [_text("switch/case %d" % n, value) for n, value in enumerate("abcde", start=1)]
			assert await _output(host, _execute(1, "logic/switch", configs), 1) == generate_id("case_5")

	asyncio.run(go())
