import asyncio

from .core.action import HIOAction
from .core.context import HIOContext
from .core.stream import HIOStream, HIOStreamError

# Runs an action without the runtime — in a component's unit tests, or by hand
# on the board's REPL:
#
#   from henglosio.sdk.testing import MemoryContext, run
#   from components.http.request import RequestAction
#
#   ctx = MemoryContext({"request/method": "GET", "request/url": "https://example.com"})
#   run(RequestAction, ctx)       # -> "ok"
#   ctx.published                 # {"status": 200, "body": "...", ...}
#
# Values go in as an action receives them from the runtime: a string or
# options config as a str, an integer config as an int, a float config as a
# float, a toggle as a bool, a list / object as a list / dict, a file as
# bytes. Nothing imports this module at runtime — it only costs what a test
# that uses it loads.


class MemoryStream(HIOStream):
	# A STREAM config whose whole value is already here: handed out in chunks
	# of `chunk_size` bytes, like the host would send them. Read once.

	def __init__(self, data: "bytes | bytearray", chunk_size: int = 64, data_type: int = 0) -> None:
		self._data = bytes(data)
		self._chunk_size = max(1, chunk_size)
		self.config_id = 0
		self.data_type = data_type
		self.total_size = len(self._data)
		self.received = 0

	async def __anext__(self) -> memoryview:
		if self.received >= self.total_size:
			raise StopAsyncIteration
		chunk = memoryview(self._data)[self.received:self.received + self._chunk_size]
		self.received += len(chunk)
		return chunk


class MemoryContext(HIOContext):
	# An HIOContext over plain dicts, looked up like the runtime's
	# ActionContext: `values` (the configs given, and what the action
	# published — set() replaces a config of the same name) first, then the
	# workflow `variables`. What the action published is in `published`.

	def __init__(self, configs: "dict | None" = None, variables: "dict | None" = None, streams: "dict | None" = None) -> None:
		self.values = dict(configs or {})
		self.variables = dict(variables or {})
		# name -> the stream's bytes (or a MemoryStream, for its own chunk size).
		self.streams = dict(streams or {})
		self.published = {}

	def get(self, name: str):
		if name in self.values:
			return self.values[name]
		return self.variables.get(name)

	def set(self, name: str, value) -> None:
		self.values[name] = value
		self.published[name] = value

	def variable(self, name: str):
		return self.variables.get(name)

	def set_variable(self, name: str, value) -> bool:
		self.variables[name] = value
		return True

	def remove_variable(self, name: str) -> bool:
		return self.variables.pop(name, None) is not None

	def remove(self, name: str) -> bool:
		# Like the runtime: the run's values only, never a variable.
		return self.values.pop(name, None) is not None

	def stream(self, name: str) -> HIOStream:
		value = self.streams.get(name)
		if value is None:
			raise HIOStreamError("'%s' is not a STREAM config of this execution" % name)
		if not isinstance(value, HIOStream):
			value = self.streams[name] = MemoryStream(value)
		return value


def run(action: "type | HIOAction", context: "MemoryContext | None" = None) -> "str | None":
	# Runs `action` once with `context` (an empty one when left out) and
	# returns the output it ended on. A class gets an instance, initialized
	# like the runtime does the first time; an instance is reused as it is.
	if isinstance(action, type):
		action = action()
		action.initialize()
	context = context if context is not None else MemoryContext()
	action.context = context
	return asyncio.run(action.execute(context))
