# builtin/flow/Switch.py — "logic/switch": out the first case whose condition
# holds, or Default. Each case is its own condition (n8n style): "Case N
# value", "Case N operation" ("<type>:<operation>", see operators.py) and
# "Case N compare to", going out "case_N".

import asyncio

from support import Host

from builtin_support import boolean, execute, json_value, number, output, records, run, text
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.builtin.flow import Switch
from hio.system.core.services.PacketCodec import CodeLink, Config, DataType, OutputId, VariableLink

OTHERWISE = generate_id("otherwise")


def case_out(n: int) -> int:
	return generate_id("case_%d" % n)


def case(n: int, value=None, operation: "str | None" = "string:equals", compare=None) -> list:
	# Case `n`'s configs: `value` / `compare` a str (typed in, as text) or a
	# Config already built (typed); None leaves that one out.
	def operand(role: str, given):
		name = "switch/case %d %s" % (n, role)
		if given is None:
			return []
		if isinstance(given, str):
			return [text(name, given)]
		return [Config(generate_id(name), given.data_type, given.data)]

	configs = operand("value", value) + operand("compare to", compare)
	if operation is not None:
		configs.append(text("switch/case %d operation" % n, operation))
	return configs


def switch(frame_id: int, *cases: list, codes=(), variables=()) -> bytes:
	return execute(frame_id, "logic/switch", [config for configs in cases for config in configs], variables, codes)


def test_one_equal_to_one_goes_out_its_case():
	async def go():
		async with Host() as host:
			assert await output(host, switch(1, case(1, "1", compare="1")), 1) == case_out(1)

	asyncio.run(go())


def test_the_first_case_that_holds_wins():
	async def go():
		async with Host() as host:
			frame = switch(1, case(1, "a", compare="b"), case(2, "x", compare="x"), case(3, "x", compare="x"))
			assert await output(host, frame, 1) == case_out(2)

	asyncio.run(go())


def test_no_case_holding_goes_out_default():
	async def go():
		async with Host() as host:
			frame = switch(1, case(1, "blue", compare="red"), case(2, "blue", compare="green"))
			assert await output(host, frame, 1) == OTHERWISE

	asyncio.run(go())


def test_scripts_returning_true_on_both_sides_hold():
	# Value and Compare to bound to `return True`: both arrive as bools, equal.
	async def go():
		async with Host() as host:
			codes = [
				CodeLink(generate_id("switch/case 1 value"), DataType.AUTO, b"return True"),
				CodeLink(generate_id("switch/case 1 compare to"), DataType.AUTO, b"return True"),
			]
			assert await output(host, switch(1, case(1), codes=codes), 1) == case_out(1)                          # string:equals
			assert await output(host, switch(2, case(1, operation="boolean:equals"), codes=codes), 2) == case_out(1)

	asyncio.run(go())


def test_each_case_reads_its_value_as_its_operations_type():
	async def go():
		async with Host() as host:
			# A typed number against a typed-in one.
			assert await output(host, switch(1, case(1, number("_", 70.0), "number:gt", "50")), 1) == case_out(1)
			# "10" and "9" as numbers, not text ("10" < "9" as text).
			assert await output(host, switch(2, case(1, "10", "number:gt", "9")), 2) == case_out(1)
			# A bool, on its own.
			assert await output(host, switch(3, case(1, boolean("_", True), "boolean:is_true")), 3) == case_out(1)
			# A list, by what it holds and its length.
			assert await output(host, switch(4, case(1, json_value("_", [1, 2, 3]), "array:contains", "2")), 4) == case_out(1)
			assert await output(host, switch(5, case(1, json_value("_", [1, 2, 3]), "array:length_gte", "3")), 5) == case_out(1)
			# An object, empty or not.
			assert await output(host, switch(6, case(1, json_value("_", {"a": 1}), "object:is_not_empty")), 6) == case_out(1)
			# Text, by a pattern.
			assert await output(host, switch(7, case(1, "GPIO12", "string:regex", "^GPIO\\d+$")), 7) == case_out(1)

	asyncio.run(go())


def test_a_value_that_does_not_read_as_the_type_fails_the_case():
	async def go():
		async with Host() as host:
			assert await output(host, switch(1, case(1, "abc", "number:gt", "1")), 1) == OTHERWISE
			assert await output(host, switch(2, case(1, "maybe", "boolean:is_true")), 2) == OTHERWISE

	asyncio.run(go())


def test_a_case_with_no_value_exists_only_for_not_exists():
	async def go():
		async with Host() as host:
			assert await output(host, switch(1, case(1, None, "string:exists")), 1) == OTHERWISE
			assert await output(host, switch(2, case(1, None, "string:not_exists")), 2) == case_out(1)
			assert await output(host, switch(3, case(1, None, compare="x")), 3) == OTHERWISE

	asyncio.run(go())


def test_a_case_without_an_operation_never_holds():
	async def go():
		async with Host() as host:
			frame = switch(1, case(1, "x", operation=None, compare="x"), case(2, "y", compare="y"))
			assert await output(host, frame, 1) == case_out(2)

	asyncio.run(go())


def test_an_unknown_operation_never_holds():
	async def go():
		async with Host() as host:
			assert await output(host, switch(1, case(1, "x", "string:nope", "x")), 1) == OTHERWISE
			assert await output(host, switch(2, case(1, "x", "nope:equals", "x")), 2) == OTHERWISE

	asyncio.run(go())


def test_a_case_left_by_another_switch_does_not_linger():
	# Same config ids: this node has no Case 2, the last node's mustn't count.
	async def go():
		async with Host() as host:
			first = switch(1, case(1, "a", compare="b"), case(2, "x", compare="x"))
			assert await output(host, first, 1) == case_out(2)
			assert await output(host, switch(2, case(1, "a", compare="b")), 2) == OTHERWISE

	asyncio.run(go())


def test_cases_past_the_two_it_starts_with_go_out_their_own_output():
	async def go():
		async with Host() as host:
			cases = [case(n, "e", compare=letter) for n, letter in enumerate("abcde", start=1)]
			assert await output(host, switch(1, *cases), 1) == case_out(5)

	asyncio.run(go())


def test_a_case_value_can_be_a_variable():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [Config(variable_id("mode"), DataType.STRING, b"auto")]))
			await host.response(1)
			frame = switch(2, case(1, compare="auto"),
				variables=[VariableLink(generate_id("switch/case 1 value"), variable_id("mode"))])
			assert await output(host, frame, 2) == case_out(1)

	asyncio.run(go())


def test_a_run_of_switch_answers_like_an_execute():
	async def go():
		async with Host() as host:
			frame = run(1, "logic/switch", case(1, "1", compare="1"))
			assert await output(host, frame, 1) == case_out(1)

	asyncio.run(go())


def test_its_config_ids_are_what_the_studio_sends():
	# generate_id("<action>/<display name>") lowercased — computeWireConfigId.
	assert generate_id("switch/case 1 value") in Switch.CONFIG_IDS
	assert generate_id("switch/case 1 operation") in Switch.CONFIG_IDS
	assert generate_id("switch/case 1 compare to") in Switch.CONFIG_IDS
	assert generate_id("switch/case 12 compare to") in Switch.CONFIG_IDS     # MAX_SWITCH_CASES in the studio


def test_switch_is_run_by_the_runtime_not_the_registry(tmp_path):
	assert Switch.ACTION_ID == generate_id("logic/switch")
	assert Switch.ACTION_ID in FLOW_ACTION_IDS
	assert registry.find(Switch.ACTION_ID) is None
	assert records(tmp_path, "logic/switch") == OutputId.SUCCESS
