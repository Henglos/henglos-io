# builtin/flow/Repeat.py — "logic/repeat": out Loop `times` times, publishing
# which time round it is ("iteration"), then Done — and back to zero.

import asyncio

from support import Host

from builtin_support import as_int, execute, number, output, records, run, text
from henglosio.sdk.core import registry
from henglosio.sdk.core.identifier import generate_id
from hio.system.core.builtin import FLOW_ACTION_IDS
from hio.system.core.builtin.flow import Repeat
from hio.system.core.services.PacketCodec import OutputId

LOOP = generate_id("loop")
DONE = generate_id("done")
ITERATION = generate_id("iteration")


async def _round(host, frame: bytes, frame_id: int):
	# (output, iteration) of one pass through the Repeat.
	host.send(frame)
	response = await host.response(frame_id)
	iteration = response.configs.get(ITERATION)
	return response.id, None if iteration is None else as_int(iteration)


def test_repeat_loops_its_times_then_done_and_starts_over():
	async def go():
		async with Host() as host:
			seen = [await _round(host, execute(n, "logic/repeat", [text("repeat/times", "2")]), n) for n in range(1, 5)]
			assert seen == [(LOOP, 1), (LOOP, 2), (DONE, None), (LOOP, 1)]     # Done reset it

	asyncio.run(go())


def test_repeat_of_zero_or_nothing_goes_straight_to_done():
	async def go():
		async with Host() as host:
			assert await output(host, execute(1, "logic/repeat", [number("repeat/times", 0.0)]), 1) == DONE
			assert await output(host, execute(2, "logic/repeat"), 2) == DONE
			assert await output(host, execute(3, "logic/repeat", [text("repeat/times", "abc")]), 3) == DONE

	asyncio.run(go())


def test_each_repeat_node_counts_on_its_own():
	# By INSTANCE_ID: a nested Repeat doesn't advance the outer one's count.
	reads = {generate_id("repeat/times"): 3}
	repeats = {}
	Repeat.evaluate(reads.get, 1, repeats, True)
	Repeat.evaluate(reads.get, 2, repeats, True)
	Repeat.evaluate(reads.get, 1, repeats, True)
	assert repeats == {1: 2, 2: 1}


def test_a_run_says_what_the_next_step_would_be_without_counting():
	async def go():
		async with Host() as host:
			times = [text("repeat/times", "2")]
			assert await _round(host, run(1, "logic/repeat", times), 1) == (LOOP, 1)
			assert await _round(host, run(2, "logic/repeat", times), 2) == (LOOP, 1)

	asyncio.run(go())


def test_the_evaluation_on_its_own():
	reads = {generate_id("repeat/times"): 1}
	repeats = {}
	output_id, results = Repeat.evaluate(reads.get, 7, repeats, True)
	assert (output_id, repeats) == (LOOP, {7: 1}) and [r.config_id for r in results] == [ITERATION]
	assert Repeat.evaluate(reads.get, 7, repeats, True) == (DONE, None) and repeats == {}


def test_repeat_is_run_by_the_runtime_not_the_registry(tmp_path):
	assert Repeat.ACTION_ID == generate_id("logic/repeat")
	assert Repeat.ACTION_ID in FLOW_ACTION_IDS
	assert registry.find(Repeat.ACTION_ID) is None
	assert records(tmp_path, "logic/repeat") == OutputId.SUCCESS
