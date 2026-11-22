# builtin/flow/If.py — "logic/if": out True or False, by a condition (or two,
# joined with Combine). Its operands come typed (a bind, a variable, a script)
# or as text (a typed-in "string" config), compared as numbers when both are.

import asyncio

from support import Host

from builtin_support import execute, number, output, records, run, text
from henglosio.sdk import HIOAction, action
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.builtin.flow import If
from hio.system.core.services.PacketCodec import CodeLink, Config, DataType, OutputId, VariableLink

TRUE = generate_id("true")
FALSE = generate_id("false")


def _if(frame_id: int, value, condition: str, compare=None, **second) -> bytes:
	configs = [value, text("if/condition", condition)]
	if compare is not None:
		configs.append(compare)
	configs.extend(second.values())
	return execute(frame_id, "logic/if", configs)


@action("if test/status")
class _Status(HIOAction):
	async def execute(self, context):
		context.set("result", {"status": 200, "body": "ok"})
		return None


def test_if_goes_out_true_or_false():
	async def go():
		async with Host() as host:
			assert await output(host, _if(1, number("if/value", 25.5), "gt", text("if/compare to", "20")), 1) == TRUE
			assert await output(host, _if(2, number("if/value", 15.0), "gt", text("if/compare to", "20")), 2) == FALSE
			assert await output(host, _if(3, text("if/value", "on"), "is_true"), 3) == TRUE

	asyncio.run(go())


def test_if_without_a_condition_compares_for_equality():
	async def go():
		async with Host() as host:
			frame = execute(1, "logic/if", [text("if/value", "1"), text("if/compare to", "1")])
			assert await output(host, frame, 1) == TRUE

	asyncio.run(go())


def test_if_with_nothing_to_test_goes_out_false():
	async def go():
		async with Host() as host:
			frame = execute(1, "logic/if", [text("if/condition", "eq"), text("if/compare to", "1")])
			assert await output(host, frame, 1) == FALSE

	asyncio.run(go())


def test_if_combines_two_conditions():
	def frame(frame_id, combine, second_value):
		return _if(
			frame_id, number("if/value", 5.0), "gt", text("if/compare to", "1"),
			combine=text("if/combine", combine),
			value2=number("if/value 2", second_value),
			condition2=text("if/condition 2", "lt"),
			compare2=text("if/compare to 2", "3"),
		)

	async def go():
		async with Host() as host:
			assert await output(host, frame(1, "and", 9.0), 1) == FALSE   # 5 > 1, 9 < 3 doesn't
			assert await output(host, frame(2, "or", 9.0), 2) == TRUE
			assert await output(host, frame(3, "and", 2.0), 3) == TRUE
			assert await output(host, frame(4, "none", 9.0), 4) == TRUE   # the second is ignored

	asyncio.run(go())


def test_if_reads_a_variable():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [Config(variable_id("mode"), DataType.STRING, b"auto")]))
			await host.response(1)

			frame = execute(2, "logic/if",
				[text("if/condition", "eq"), text("if/compare to", "auto")],
				[VariableLink(generate_id("if/value"), variable_id("mode"))])
			assert await output(host, frame, 2) == TRUE

	asyncio.run(go())


def test_a_number_a_script_returns_into_a_text_operand_compares_as_one():
	# If's Value is a "string" config: `return ctx.get("result")["status"]`
	# hands it 200 — "200" — not an error that leaves it empty (and False).
	async def go():
		async with Host() as host:
			host.send(execute(1, "if test/status"))
			await host.response(1)
			frame = execute(2, "logic/if",
				[text("if/condition", "eq"), text("if/compare to", "200")],
				codes=[CodeLink(generate_id("if/value"), DataType.STRING, b'return ctx.get("result")["status"]')])
			assert await output(host, frame, 2) == TRUE

	asyncio.run(go())


def test_is_greater_than_compares_a_returned_number_as_a_number():
	async def go():
		async with Host() as host:
			host.send(execute(1, "if test/status"))
			await host.response(1)
			frame = execute(2, "logic/if",
				[text("if/condition", "gt"), text("if/compare to", "150")],
				codes=[CodeLink(generate_id("if/value"), DataType.AUTO, b'return ctx.get("result")["status"]')])
			assert await output(host, frame, 2) == TRUE

	asyncio.run(go())


def test_a_condition_left_by_another_if_does_not_linger():
	# The first If sends its second condition; the next one doesn't — Combine
	# "and" must not find the last node's "if/value 2" still there.
	async def go():
		async with Host() as host:
			first = _if(1, number("if/value", 5.0), "gt", text("if/compare to", "1"),
				combine=text("if/combine", "and"),
				value2=number("if/value 2", 1.0),
				condition2=text("if/condition 2", "lt"),
				compare2=text("if/compare to 2", "3"))
			assert await output(host, first, 1) == TRUE
			second = _if(2, number("if/value", 5.0), "gt", text("if/compare to", "1"), combine=text("if/combine", "and"))
			assert await output(host, second, 2) == FALSE

	asyncio.run(go())


def test_a_run_of_if_answers_like_an_execute():
	async def go():
		async with Host() as host:
			frame = run(1, "logic/if", [number("if/value", 3.0), text("if/condition", "lt"), text("if/compare to", "4")])
			assert await output(host, frame, 1) == TRUE

	asyncio.run(go())


def test_if_is_run_by_the_runtime_not_the_registry(tmp_path):
	assert If.ACTION_ID == generate_id("logic/if")
	assert If.ACTION_ID in FLOW_ACTION_IDS
	assert registry.find(If.ACTION_ID) is None
	assert records(tmp_path, "logic/if") == OutputId.SUCCESS
