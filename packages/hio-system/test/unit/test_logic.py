# Logic.py — the conditions If uses (and Switch's operations build on): one
# operand tested on its own, or compared with another. Operands come typed or
# as text, compared as numbers when both read as one. The built-in actions
# themselves are tested in test/builtin.

import struct

from henglosio.sdk.core.identifier import generate_id
from hio.system.core import Logic
from hio.system.core.services.PacketCodec import CodeLink, DataType


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


def test_a_logic_operand_from_code_keeps_the_type_it_was_returned_as():
	# RESULT TYPE AUTO (what Logic's operands get): 200 stays an int, True a
	# bool, a dict its JSON — not their text.
	from hio.system.core.Context import PipelineContext, ScriptContext
	from hio.system.core.GlobalVariables import GlobalVariables
	from hio.system.core.services.ScriptEngine import ScriptEngine

	engine = ScriptEngine(4)
	context = ScriptContext(PipelineContext(4), GlobalVariables(0))
	typed = lambda source: engine.evaluate(CodeLink(generate_id("if/value"), DataType.AUTO, source), context)

	assert (typed(b"return 200").data_type, struct.unpack("<i", typed(b"return 200").data)[0]) == (DataType.INTEGER, 200)
	assert typed(b"return 2.5").data_type == DataType.FLOAT
	assert (typed(b"return True").data_type, bytes(typed(b"return True").data)) == (DataType.BOOL, b"\x01")
	assert typed(b'return "ok"').data_type == DataType.STRING
	assert typed(b'return [1]').data_type == DataType.LIST
	assert typed(b'return {"a": 1}').data_type == DataType.OBJECT
