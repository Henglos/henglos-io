# henglosio.sdk.testing: an action runs without the runtime, over plain dicts, and
# sees its values the way the runtime's ActionContext hands them out.

import pytest

from henglosio.sdk import HIOAction, HIOContext, HIOStreamError, SUCCESS, FALLBACK
from henglosio.sdk.testing import MemoryContext, MemoryStream, run


class _Echo(HIOAction):
	# Publishes what it reads, ends on a custom output when told to.
	def initialize(self) -> None:
		self.calls = 0

	async def execute(self, context):
		self.calls += 1
		context.set("seen", context.get("echo/value"))
		context.set("counter", context.variable("counter"))
		return "custom" if context.get("echo/branch") else SUCCESS


class _Override(HIOAction):
	# Publishes over a config's name, then reads it back — and removes it.
	async def execute(self, context):
		context.set("echo/value", 2)
		after_set = context.get("echo/value")
		removed = context.remove("echo/value")
		context.set("result", (after_set, removed, context.get("echo/value")))
		return None


class _Reader(HIOAction):
	async def execute(self, context):
		chunks = [bytes(chunk) async for chunk in self.batch("data")]
		context.set("chunks", chunks)
		return SUCCESS


class _ReadAll(HIOAction):
	async def execute(self, context):
		context.set("all", bytes(await self.batch("data").read()))
		return SUCCESS


def test_it_is_an_hio_context():
	assert isinstance(MemoryContext(), HIOContext)


def test_runs_a_class_initialized_and_reports_what_it_published():
	ctx = MemoryContext({"echo/value": b"hi"}, variables={"counter": 3})
	assert run(_Echo, ctx) == SUCCESS
	assert ctx.published == {"seen": b"hi", "counter": 3}


def test_custom_outputs_and_a_reused_instance():
	instance = _Echo()
	instance.initialize()
	assert run(instance, MemoryContext({"echo/branch": True})) == "custom"
	assert run(instance, MemoryContext()) == SUCCESS
	assert instance.calls == 2


def test_lookup_order_and_remove_follow_the_runtime():
	# A config or published value wins over a variable of the same name.
	ctx = MemoryContext({"name": 1}, variables={"name": 9})
	assert ctx.get("name") == 1
	assert ctx.variable("name") == 9
	assert ctx.get("missing") is None

	ctx = MemoryContext({"echo/value": 1}, variables={"echo/value": 7})
	run(_Override, ctx)
	# set() replaced the config, remove() dropped it — the variable stays.
	assert ctx.published["result"] == (2, True, 7)
	assert ctx.variable("echo/value") == 7


def test_streams_in_chunks_and_whole():
	ctx = MemoryContext(streams={"data": MemoryStream(b"abcdefg", chunk_size=3)})
	run(_Reader, ctx)
	assert ctx.published["chunks"] == [b"abc", b"def", b"g"]

	ctx = MemoryContext(streams={"data": b"x" * 200})
	run(_ReadAll, ctx)
	assert ctx.published["all"] == b"x" * 200


def test_a_missing_stream_fails_like_the_runtime():
	with pytest.raises(HIOStreamError):
		run(_Reader, MemoryContext())


def test_an_empty_context_when_none_is_given():
	class _Nothing(HIOAction):
		async def execute(self, context):
			return FALLBACK if context.get("anything") is None else SUCCESS

	assert run(_Nothing) == FALLBACK
