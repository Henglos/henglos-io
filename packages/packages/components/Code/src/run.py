import json

from hio.sdk import HIOAction, action, SUCCESS, FALLBACK


# Code / Run — runs a short Python script written in the studio, on the board.
#
#   ACTION_ID  "code/run"
#   configs    "run/script" (code -> text, the script's source)
#   output     "result"     (whatever the script returned, if it returned something
#                           — a list or a dict goes out as its JSON)
#   output     "error"      (text, why it went out Fallback)
#
# The script is the body of a function, as-is — same model as a CODE binding
# (ScriptEngine.py): `ctx.get(name)` reads configs and what earlier actions
# published, `return <value>` publishes it as "result". Locals, if/else and
# several statements before the return are fine. A script that raises, or
# returns something that can't be published, goes out Fallback with "error".
#
# Compiling on the board costs RAM, so each distinct source is compiled once
# and cached — a looping program runs the same script over and over.

_CACHE_SIZE = 8
_ERROR_MAX = 60     # "error" travels like any value: keep it within one config


class _ReadOnlyContext:
	# What the script sees as `ctx`: reading only — it publishes by returning.

	def __init__(self, context) -> None:
		self._context = context

	def get(self, name: str):
		return self._context.get(name)

	def var(self, name: str):
		# A workflow variable — see HIOContext.variable.
		return self._context.variable(name)


def _publishable(value) -> bool:
	# What HIOContext.set can encode (Context.encode_value): bool/int/float,
	# text, bytes-like — or a list / tuple / dict, as its JSON, so only what
	# JSON holds inside it (no bytes, no objects).
	if isinstance(value, (bool, int, float, str, bytes, bytearray, memoryview)):
		return True
	if isinstance(value, (list, tuple, dict)):
		try:
			json.dumps(value)
		except (TypeError, ValueError):
			return False
		return True
	return False


@action("code/run")
class RunAction(HIOAction):

	def initialize(self) -> None:
		self._cache = {}                    # source bytes -> compiled function

	async def execute(self, context):

		source = context.get("run/script")
		if source is None:
			return SUCCESS                  # empty script: nothing to run

		try:
			function = self._compile(bytes(source))
			value = function(_ReadOnlyContext(context))
		except Exception as error:
			context.set("error", repr(error)[:_ERROR_MAX])
			return FALLBACK

		if value is None:
			return SUCCESS

		if not _publishable(value):
			context.set("error", "can't publish a %s" % type(value).__name__)
			return FALLBACK

		context.set("result", value)
		return SUCCESS

	def _compile(self, key: bytes):

		function = self._cache.get(key)
		if function is not None:
			return function

		# Every line indented one level under a function header. A single
		# leading space keeps the script's own indentation (tabs or spaces)
		# consistent. The trailing `pass` gives an empty script a body.
		lines = key.decode().replace("\r\n", "\n").split("\n")
		source = "def _hio_run(ctx):\n" + "\n".join(" " + line for line in lines) + "\n pass\n"

		scope = {}
		exec(source, scope)
		function = scope["_hio_run"]

		if len(self._cache) >= _CACHE_SIZE:
			self._cache.clear()
		self._cache[key] = function

		return function
