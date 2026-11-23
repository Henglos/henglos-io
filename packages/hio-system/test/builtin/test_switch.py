# builtin/flow/Switch.py — "logic/switch": out the first of its Routing Rules
# whose conditions hold — rule N going out "case_N" — or Default. Its rules
# are a fixedCollection (LogicComponent.ts): {"values": [{"conditions":
# <filter>, "outputKey"}]}, each filter evaluated as henglosio.sdk's matches.

import asyncio

from support import Host

from builtin_support import execute, json_value, output, records, run
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id, variable_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.builtin.flow import Switch
from hio.system.core.services.PacketCodec import Config, DataType, OutputId

OTHERWISE = generate_id("otherwise")


def case_out(n: int) -> int:
	return generate_id("case_%d" % n)


def rule(*rows, combinator="and"):
	return {
		"conditions": {"combinator": combinator, "conditions": [{"leftValue": l, "operator": op, "rightValue": r} for l, op, r in rows]},
		"outputKey": "",
	}


def switch(frame_id: int, *rules, command=execute) -> bytes:
	return command(frame_id, "logic/switch", [json_value("switch/routing rules", {"values": list(rules)})])


def test_the_first_rule_that_holds_wins():
	async def go():
		async with Host() as host:
			frame = switch(1, rule(("a", "string:equals", "b")), rule(("x", "string:equals", "x")), rule(("x", "string:equals", "x")))
			assert await output(host, frame, 1) == case_out(2)

	asyncio.run(go())


def test_none_holding_goes_out_default():
	async def go():
		async with Host() as host:
			assert await output(host, switch(1, rule(("blue", "string:equals", "red"))), 1) == OTHERWISE
			assert await output(host, execute(2, "logic/switch"), 2) == OTHERWISE
			assert await output(host, switch(3), 3) == OTHERWISE

	asyncio.run(go())


def test_a_rule_without_conditions_never_holds():
	async def go():
		async with Host() as host:
			assert await output(host, switch(1, rule(), rule(("1", "number:equals", "1"))), 1) == case_out(2)

	asyncio.run(go())


def test_a_rule_combines_its_conditions():
	async def go():
		async with Host() as host:
			both = rule(("5", "number:gt", "1"), ("9", "number:lt", "3"))
			either = rule(("5", "number:gt", "1"), ("9", "number:lt", "3"), combinator="or")
			assert await output(host, switch(1, both, either), 1) == case_out(2)

	asyncio.run(go())


def test_rules_read_names_from_the_run_and_the_variables():
	async def go():
		async with Host() as host:
			host.send(execute(1, "core/start", [Config(variable_id("mode"), DataType.STRING, b"manual")]))
			await host.response(1)
			frame = switch(2, rule(("{{ mode }}", "string:equals", "auto")), rule(("{{ mode }}", "string:equals", "manual")))
			assert await output(host, frame, 2) == case_out(2)

	asyncio.run(go())


def test_rules_past_the_two_it_starts_with_go_out_their_own_output():
	# 3 rules: within MAX_DATA_BUFFER's default 512 bytes — all of them are one
	# value (more need the setting raised; the studio says so when it compiles).
	async def go():
		async with Host() as host:
			rules = [rule(("c", "string:equals", letter)) for letter in "abc"]
			assert await output(host, switch(1, *rules), 1) == case_out(3)

	asyncio.run(go())


def test_a_run_of_switch_answers_like_an_execute():
	async def go():
		async with Host() as host:
			assert await output(host, switch(1, rule(("1", "string:equals", "1")), command=run), 1) == case_out(1)

	asyncio.run(go())


def test_switch_is_run_by_the_runtime_not_the_registry(tmp_path):
	assert Switch.ACTION_ID == generate_id("logic/switch")
	# generate_id("<action>/<display name>") lowercased — computeWireConfigId.
	assert Switch.CONFIG_IDS == (generate_id("switch/routing rules"),)
	assert Switch.ACTION_ID in FLOW_ACTION_IDS
	assert registry.find(Switch.ACTION_ID) is None
	assert records(tmp_path, "logic/switch") == OutputId.SUCCESS
