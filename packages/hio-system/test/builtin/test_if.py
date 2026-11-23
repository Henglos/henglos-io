# builtin/flow/If.py — "logic/if": out True or False, by its Conditions — a
# filter (LogicComponent.ts): {"combinator", "conditions": [{"leftValue",
# "operator", "rightValue"}]}, evaluated as henglosio.sdk's matches does,
# "{{ name }}" read from the run's values and the variables.

import asyncio

from support import Host

from builtin_support import execute, json_value, output, records, run
from henglosio.sdk import HIOAction, action
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.builtin.flow import If
from hio.system.core.services.PacketCodec import CodeLink, Config, DataType, OutputId

TRUE = generate_id("true")
FALSE = generate_id("false")


def conditions(*rows, combinator="and"):
	return {
		"combinator": combinator,
		"conditions": [{"id": "c%d" % i, "leftValue": left, "operator": op, "rightValue": right} for i, (left, op, right) in enumerate(rows)],
	}


def if_frame(frame_id: int, value, command=execute) -> bytes:
	return command(frame_id, "logic/if", [json_value("if/conditions", value)])


@action("if test/status")
class _Status(HIOAction):
	async def execute(self, context):
		context.set("status", 200)
		context.set("room", "lab")
		return None


def test_one_condition_goes_out_true_or_false():
	async def go():
		async with Host() as host:
			assert await output(host, if_frame(1, conditions(("1", "string:equals", "1"))), 1) == TRUE
			assert await output(host, if_frame(2, conditions(("1", "string:equals", "2"))), 2) == FALSE
			assert await output(host, if_frame(3, conditions(("25.5", "number:gt", "20"))), 3) == TRUE
			assert await output(host, if_frame(4, conditions(("on", "boolean:is_true", None))), 4) == TRUE

	asyncio.run(go())


def test_and_needs_every_condition_or_any():
	async def go():
		async with Host() as host:
			rows = (("5", "number:gt", "1"), ("9", "number:lt", "3"))
			assert await output(host, if_frame(1, conditions(*rows)), 1) == FALSE
			assert await output(host, if_frame(2, conditions(*rows, combinator="or")), 2) == TRUE

	asyncio.run(go())


def test_names_read_the_run_and_the_variables():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [Config(variable_id("mode"), DataType.STRING, b"auto")]))
			await host.response(1)
			host.send(execute(2, "if test/status"))
			await host.response(2)
			frame = if_frame(3, conditions(("{{ status }}", "number:gte", "200"), ("{{ mode }}", "string:equals", "auto"), ("{{room}}", "string:equals", "lab")))
			assert await output(host, frame, 3) == TRUE
			assert await output(host, if_frame(4, conditions(("{{ status }}", "number:gt", "500"))), 4) == FALSE

	asyncio.run(go())


def test_no_conditions_is_false():
	async def go():
		async with Host() as host:
			assert await output(host, execute(1, "logic/if"), 1) == FALSE
			assert await output(host, if_frame(2, conditions()), 2) == FALSE
			assert await output(host, if_frame(3, {"combinator": "and", "conditions": [{"leftValue": "x", "operator": ""}]}), 3) == FALSE

	asyncio.run(go())


def test_conditions_from_a_script():
	async def go():
		async with Host() as host:
			code = CodeLink(generate_id("if/conditions"), DataType.AUTO, b'return {"conditions": [{"leftValue": "1", "operator": "number:equals", "rightValue": "1"}]}')
			assert await output(host, execute(1, "logic/if", codes=[code]), 1) == TRUE

	asyncio.run(go())


def test_conditions_left_by_another_if_do_not_linger():
	async def go():
		async with Host() as host:
			assert await output(host, if_frame(1, conditions(("1", "string:equals", "1"))), 1) == TRUE
			assert await output(host, execute(2, "logic/if"), 2) == FALSE

	asyncio.run(go())


def test_a_run_of_if_answers_like_an_execute():
	async def go():
		async with Host() as host:
			assert await output(host, if_frame(1, conditions(("3", "number:lt", "4")), command=run), 1) == TRUE

	asyncio.run(go())


def test_if_is_run_by_the_runtime_not_the_registry(tmp_path):
	assert If.ACTION_ID == generate_id("logic/if")
	assert If.CONFIG_IDS == (generate_id("if/conditions"),)
	assert If.ACTION_ID in FLOW_ACTION_IDS
	assert registry.find(If.ACTION_ID) is None
	assert records(tmp_path, "logic/if") == OutputId.SUCCESS
