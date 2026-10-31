import json
import struct

from .PacketCodec import CodeLink, Config, DataType, MAX_DATA_BUFFER


# Scalar RESULT_TYPEs a script can produce: struct format + accepted range.
# The reduced FLOAT_8/FLOAT_16 and the UFLOAT_* types have no defined packing,
# same as in the C++ ScriptService, so a CODE config can't target them.
_INTEGERS = {
	DataType.UINT_8: ("<B", 0, 0xFF),
	DataType.UINT_16: ("<H", 0, 0xFFFF),
	DataType.UINT_32: ("<I", 0, 0xFFFFFFFF),
	DataType.INT_8: ("<b", -0x80, 0x7F),
	DataType.INT_16: ("<h", -0x8000, 0x7FFF),
	DataType.INT_32: ("<i", -0x80000000, 0x7FFFFFFF),
}


def _native(value) -> "tuple[int, bytes, bool]":
	# RESULT_TYPE AUTO: the value as the type it is — (DataType, data, is_array).
	if isinstance(value, bool):
		return DataType.BOOL, b"\x01" if value else b"\x00", False
	if isinstance(value, int) and -0x80000000 <= value <= 0x7FFFFFFF:
		return DataType.INT_32, struct.pack("<i", value), False
	if isinstance(value, (int, float)):
		return DataType.FLOAT_32, struct.pack("<f", value), False
	if isinstance(value, str):
		return DataType.UINT_8, value.encode()[:MAX_DATA_BUFFER], True
	if isinstance(value, (bytes, bytearray, memoryview)):
		return DataType.UINT_8, bytes(value)[:MAX_DATA_BUFFER], True
	if isinstance(value, (list, tuple, dict)):
		return DataType.JSON, _coerce(value, DataType.JSON, True), True
	raise ValueError("can't publish a %s" % type(value).__name__)


def _coerce(value, result_type: int, is_array: bool) -> bytes:
	# What the script returned -> the config's bytes, or ValueError.

	if result_type == DataType.JSON:
		# A list or an object config — its JSON. Rejected past MAX_DATA_BUFFER:
		# cut, it wouldn't be JSON any more.
		if not isinstance(value, (list, tuple, dict)):
			raise ValueError("expected a list or a dict, got %s" % type(value).__name__)
		data = json.dumps(value).encode()
		if len(data) > MAX_DATA_BUFFER:
			raise ValueError("%d bytes of JSON — at most %d fit" % (len(data), MAX_DATA_BUFFER))
		return data

	if is_array:
		# Only an array of UINT_8 is defined: text, raw bytes, or a list of
		# 0-255 ints (e.g. [255, 0, 0, 255] for an RGBA color). A number, a
		# bool or a dict goes into a text config as its text — `return
		# ctx.get("result")["status"]` into If's Value is "200", not an error.
		# Truncated, not rejected, past MAX_DATA_BUFFER.
		if result_type != DataType.UINT_8:
			raise ValueError("array result only supported for UINT_8")
		if isinstance(value, str):
			data = value.encode()
		elif isinstance(value, (bytes, bytearray, memoryview)):
			data = bytes(value)
		elif isinstance(value, bool):
			data = b"true" if value else b"false"
		elif isinstance(value, int):
			data = str(value).encode()
		elif isinstance(value, float):
			data = (str(int(value)) if value == int(value) else repr(value)).encode()
		elif isinstance(value, dict):
			data = json.dumps(value).encode()
		elif isinstance(value, (list, tuple)):
			data = bytes(value)             # ValueError on anything outside 0-255
		else:
			raise ValueError("expected str, bytes or a list of 0-255 ints, got %s" % type(value).__name__)
		return data[:MAX_DATA_BUFFER]

	if result_type == DataType.BOOL:
		if not isinstance(value, (bool, int)):
			raise ValueError("expected bool, got %s" % type(value).__name__)
		return b"\x01" if value else b"\x00"

	if result_type == DataType.FLOAT_32:
		if not isinstance(value, (int, float)) or isinstance(value, bool):
			raise ValueError("expected a number, got %s" % type(value).__name__)
		return struct.pack("<f", value)

	integer = _INTEGERS.get(result_type)
	if integer is None:
		raise ValueError("result type %d not supported" % result_type)

	fmt, low, high = integer
	if isinstance(value, float) and value == int(value):
		value = int(value)
	if not isinstance(value, int) or isinstance(value, bool):
		raise ValueError("expected an int, got %s" % type(value).__name__)
	if not low <= value <= high:
		raise ValueError("%d out of range" % value)
	return struct.pack(fmt, value)


# Runs the Python source of CODE configs — the MicroPython counterpart of the
# C++ ScriptService (which ran Lua). The source runs as the body of a
# function, as-is, so it needs an explicit `return <value>`; locals, if/else
# and several statements before the return are fine. `ctx.get(name)` reads
# the values shared between actions (this action's own configs and binds
# included). No return, an exception, or a value that can't be coerced into
# the RESULT_TYPE: the config is dropped, and lastError says why.
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
			if code.result_type == DataType.AUTO:
				data_type, data, is_array = _native(value)
				return Config(code.config_id, data_type, data, is_array)
			data = _coerce(value, code.result_type, code.is_array)
		except Exception as error:
			self.lastError = repr(error)
			return None

		return Config(code.config_id, code.result_type, data, code.is_array)

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
