from .PacketCodec import CodeLink, Config, DataType, MAX_DATA_BUFFER, is_sized
from ..Context import convert


# Runs the Python source of CODE configs — the MicroPython counterpart of the
# C++ ScriptService (which ran Lua). The source runs as the body of a
# function, as-is, so it needs an explicit `return <value>`; locals, if/else
# and several statements before the return are fine. `ctx.get(name)` reads
# the values shared between actions (this action's own configs and binds
# included).
#
# What it returns becomes the config's value as RESULT_TYPE — converted the
# way a BIND's value is (Context.convert: only what loses nothing), or as the
# type it is with AUTO. No return, an exception, a value that can't be
# converted or one past MAX_DATA_BUFFER: the config is dropped, and lastError
# says why.
#
# Compiling on the device costs RAM, so each distinct source is compiled once
# and cached — a replayed program runs the same scripts over and over.
class ScriptEngine:

	def __init__(self, cache_size: int) -> None:
		self._cache = {}                    # source bytes -> compiled function
		self._cacheSize = cache_size
		self.lastError = ""

	def evaluate(self, code: CodeLink, context) -> "Config | None":

		self.lastError = ""

		try:
			function = self._compile(code.code)
			value = function(context)
			if value is None:
				raise ValueError("the script returned nothing")
			config = convert(code.config_id, value, code.result_type)
			if is_sized(config.data_type) and len(config.data) > MAX_DATA_BUFFER:
				raise ValueError("%d bytes — at most %d fit" % (len(config.data), MAX_DATA_BUFFER))
		except Exception as error:
			self.lastError = repr(error)
			return None

		return config

	def _compile(self, code):

		key = bytes(code)
		function = self._cache.get(key)
		if function is not None:
			return function

		# Every line indented one level under a function header. A single
		# leading space keeps the script's own indentation (tabs or spaces)
		# consistent. The trailing `pass` gives an empty script a body.
		lines = key.decode().replace("\r\n", "\n").split("\n")
		source = "def _hio_code(ctx):\n" + "\n".join(" " + line for line in lines) + "\n pass\n"

		scope = {}
		exec(source, scope)
		function = scope["_hio_code"]

		if len(self._cache) >= self._cacheSize:
			self._cache.clear()
		self._cache[key] = function

		return function
