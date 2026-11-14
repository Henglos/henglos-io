import json
import struct

from henglosio.sdk.core.context import HIOContext
from henglosio.sdk.core.stream import HIOStream, HIOStreamError
from henglosio.sdk.core.identifier import generate_id, variable_id
from .services.PacketCodec import Config, DataType
from .GlobalVariables import GlobalVariables


_INT_MIN = -0x80000000
_INT_MAX = 0x7FFFFFFF


def decode_value(config: Config) -> "int | float | bool | str | list | dict | bytes":
	# A Config's bytes as the Python value its DataType says: an int, a float,
	# a bool, a str, a list, a dict — or bytes for BYTES (and for anything that
	# doesn't read as its type: text that isn't UTF-8, JSON that doesn't parse).
	# The inverse of encode_value.
	data_type = config.data_type
	data = config.data

	if data_type == DataType.INTEGER and len(data) == 4:
		return struct.unpack("<i", data)[0]
	if data_type == DataType.FLOAT and len(data) == 4:
		return struct.unpack("<f", data)[0]
	if data_type == DataType.BOOL and len(data) == 1:
		return data[0] != 0
	if data_type == DataType.STRING:
		try:
			return bytes(data).decode()
		except UnicodeError:
			return bytes(data)
	if data_type == DataType.LIST or data_type == DataType.OBJECT:
		try:
			return json.loads(bytes(data))
		except ValueError:
			return bytes(data)
	return bytes(data)


def encode_value(config_id: int, value) -> Config:
	# A Python value as a Config under `config_id` — what an action's
	# context.set() publishes. bool before int: bool is an int subclass. An
	# int past int32 goes as a FLOAT (the closest the wire has); a tuple as a list.
	if isinstance(value, bool):
		return Config(config_id, DataType.BOOL, b"\x01" if value else b"\x00")
	if isinstance(value, int):
		if _INT_MIN <= value <= _INT_MAX:
			return Config(config_id, DataType.INTEGER, struct.pack("<i", value))
		return Config(config_id, DataType.FLOAT, struct.pack("<f", value))
	if isinstance(value, float):
		return Config(config_id, DataType.FLOAT, struct.pack("<f", value))
	if isinstance(value, str):
		return Config(config_id, DataType.STRING, value.encode())
	if isinstance(value, (list, tuple)):
		return Config(config_id, DataType.LIST, json.dumps(value).encode())
	if isinstance(value, dict):
		return Config(config_id, DataType.OBJECT, json.dumps(value).encode())
	return Config(config_id, DataType.BYTES, bytes(value))


def plain(value):
	# A value as JSON holds it: bytes as their text (UTF-8), or else a list of
	# ints; everything else as it is.
	if isinstance(value, (bytes, bytearray, memoryview)):
		try:
			return bytes(value).decode()
		except UnicodeError:
			return list(value)
	return value


# ── Converting what reaches a config ─────────────────────────────────────────
# A BIND, a VARIABLE or a script brings a value of whatever type it was
# published as; the action wants its config's (EXPECTED_TYPE). Only conversions
# that lose nothing are made: "12" -> 12, 3 -> 3.0, 3.0 -> 3, 7 -> "7",
# "true" -> True, "[1, 2]" -> [1, 2]. Anything else — "abc" or 3.7 to an
# integer, a list to a bool — raises ConversionError.

class ConversionError(ValueError):
	pass


_TYPE_NAMES = {
	DataType.INTEGER: "integer", DataType.FLOAT: "float", DataType.BOOL: "bool",
	DataType.STRING: "string", DataType.LIST: "list", DataType.OBJECT: "object",
	DataType.BYTES: "bytes", DataType.AUTO: "any",
}

_TEXT_BOOLS = {"true": True, "false": False, "1": True, "0": False}


def type_name(data_type: int) -> str:
	# A DataType as the error messages say it.
	return _TYPE_NAMES.get(data_type, "type %d" % data_type)


def _describe(value) -> str:
	# What arrived, for the error message: its type and (cut) value.
	shown = repr(value)
	if len(shown) > 40:
		shown = shown[:37] + "..."
	return "%s %s" % (type(value).__name__, shown)


def _as_int(value):
	if isinstance(value, bool):
		return 1 if value else 0
	if isinstance(value, int):
		return value
	if isinstance(value, float):
		if value != value or value in (float("inf"), float("-inf")) or value != int(value):
			return None
		return int(value)
	if isinstance(value, str):
		text = value.strip()
		try:
			return int(text)
		except ValueError:
			pass
		try:
			return _as_int(float(text))
		except ValueError:
			return None
	return None


def _as_float(value):
	if isinstance(value, bool):
		return 1.0 if value else 0.0
	if isinstance(value, (int, float)):
		return float(value)
	if isinstance(value, str):
		try:
			return float(value.strip())
		except ValueError:
			return None
	return None


def _as_text(value):
	if isinstance(value, str):
		return value
	if isinstance(value, bool):
		return "true" if value else "false"
	if isinstance(value, int):
		return str(value)
	if isinstance(value, float):
		return str(int(value)) if value == int(value) else "%.7g" % value
	if isinstance(value, (list, tuple, dict)):
		return json.dumps(value)
	try:
		return bytes(value).decode()
	except (UnicodeError, TypeError, ValueError):
		return None


def _as_json(value, kind):
	# A list or a dict (`kind`): one already, or text that is one's JSON.
	if isinstance(value, kind):
		return value
	if isinstance(value, tuple) and kind is list:
		return list(value)
	if isinstance(value, (str, bytes)):
		try:
			parsed = json.loads(value)
		except ValueError:
			return None
		if isinstance(parsed, kind):
			return parsed
	return None


def convert(config_id: int, value, expected: int) -> Config:
	# A Python value as a Config of `expected` (AUTO: as the type it is).
	# Raises ConversionError when it can't be without losing something.
	if expected == DataType.AUTO:
		return encode_value(config_id, value)

	def fail():
		raise ConversionError("expected %s, got %s" % (type_name(expected), _describe(value)))

	if expected == DataType.INTEGER:
		number = _as_int(value)
		if number is None or number < _INT_MIN or number > _INT_MAX:
			fail()
		return Config(config_id, DataType.INTEGER, struct.pack("<i", number))

	if expected == DataType.FLOAT:
		number = _as_float(value)
		if number is None:
			fail()
		return Config(config_id, DataType.FLOAT, struct.pack("<f", number))

	if expected == DataType.BOOL:
		if isinstance(value, bool):
			result = value
		elif isinstance(value, int) and value in (0, 1):
			result = value == 1
		elif isinstance(value, str) and value.strip().lower() in _TEXT_BOOLS:
			result = _TEXT_BOOLS[value.strip().lower()]
		else:
			fail()
		return Config(config_id, DataType.BOOL, b"\x01" if result else b"\x00")

	if expected == DataType.STRING:
		text = _as_text(value)
		if text is None:
			fail()
		return Config(config_id, DataType.STRING, text.encode())

	if expected == DataType.LIST or expected == DataType.OBJECT:
		parsed = _as_json(value, list if expected == DataType.LIST else dict)
		if parsed is None:
			fail()
		return Config(config_id, expected, json.dumps(parsed).encode())

	if expected == DataType.BYTES:
		if isinstance(value, str):
			return Config(config_id, DataType.BYTES, value.encode())
		if isinstance(value, (bytes, bytearray, memoryview)):
			return Config(config_id, DataType.BYTES, bytes(value))
		if isinstance(value, (list, tuple)):
			try:
				return Config(config_id, DataType.BYTES, bytes(value))
			except (ValueError, TypeError):
				pass
		fail()

	fail()


def coerce(config: Config, expected: int) -> Config:
	# `config` as `expected` (AUTO: as it is) — see convert.
	if expected == DataType.AUTO or config.data_type == expected:
		return config
	return convert(config.config_id, decode_value(config), expected)


class PipelineContext:
	# Values shared between the actions of a run, by CONFIG_ID — each action's
	# own configs and whatever it published, read back by later actions and by
	# BIND configs. Same role as the C++ Core::Context. Every value is copied
	# in: nothing here may point into a frame buffer.

	def __init__(self, max_entries: int) -> None:
		self._values = {}
		self._max_entries = max_entries

	def find(self, config_id: int) -> "Config | None":
		return self._values.get(config_id)

	def merge(self, config: Config) -> bool:
		# Replaces an existing value, or adds a new one while there's room.
		# False when it didn't fit.
		if config.config_id not in self._values and len(self._values) >= self._max_entries:
			return False
		self._values[config.config_id] = Config(config.config_id, config.data_type, bytes(config.data))
		return True

	def remove(self, config_id: int) -> bool:
		return self._values.pop(config_id, None) is not None

	def clear(self) -> None:
		self._values.clear()


def _variable(variables: GlobalVariables, name: str):
	# A workflow variable's value, by its name — None when it isn't set.
	config = variables.find(variable_id(name))
	return None if config is None else decode_value(config)


def _get(pipeline: PipelineContext, variables: GlobalVariables, name: str):
	# One lookup for whatever `name` is: a config or output of the run first —
	# a bound config already holds its variable's value there — then a
	# workflow variable by that name. The action's code doesn't need to know
	# which one it got. The run wins a tie, so nothing an action read before
	# variables existed changes.
	config = pipeline.find(generate_id(name))
	if config is None:
		config = variables.find(variable_id(name))
	return None if config is None else decode_value(config)


class ScriptContext:
	# The `ctx` a CODE config's script sees: read-only — a script computes
	# one config's value, it doesn't publish anything.

	def __init__(self, pipeline: PipelineContext, variables: GlobalVariables) -> None:
		self._pipeline = pipeline
		self._variables = variables

	def get(self, name: str):
		return _get(self._pipeline, self._variables, name)

	def var(self, name: str):
		# A workflow variable — None while it has no value.
		return _variable(self._variables, name)


class ActionContext(HIOContext):
	# The HIOContext of one execution: the pipeline values plus this
	# execution's streams, and what the action published (sent back with the
	# EXECUTE's RESPONSE).

	def __init__(self, pipeline: PipelineContext, streams: dict, variables: "GlobalVariables | None" = None) -> None:
		self._pipeline = pipeline
		self._streams = streams         # CONFIG_ID -> HIOStream
		# None: no variables (a component's own tests run an action without the runtime).
		self._variables = variables if variables is not None else GlobalVariables(0)
		self.results = []               # Config — published with set()
		# Pass Context: the next action gets what this one was handed too, not
		# only what it published (set by ExecuteCommand from its EXECUTE).
		self.passes = False
		# A config's value couldn't be converted to its type: the action doesn't run.
		self.failed = False

	def get(self, name: str):
		return _get(self._pipeline, self._variables, name)

	def set(self, name: str, value) -> None:
		config = encode_value(generate_id(name), value)
		self._pipeline.merge(config)
		self.results.append(config)

	def remove(self, name: str) -> bool:
		# Only the run's values — variables have remove_variable().
		return self._pipeline.remove(generate_id(name))

	def variable(self, name: str):
		return _variable(self._variables, name)

	def set_variable(self, name: str, value) -> bool:
		return self.store_variable(variable_id(name), encode_value(0, value))

	def remove_variable(self, name: str) -> bool:
		return self.drop_variable(variable_id(name))

	def stream(self, name: str) -> HIOStream:
		stream = self._streams.get(generate_id(name))
		if stream is None:
			raise HIOStreamError("'%s' is not a STREAM config of this execution" % name)
		return stream

	def streams(self):
		# Every stream of this execution — the runtime closes them once the action ends.
		return self._streams.values()

	# ── Runtime-only (the built-in actions, not the SDK) ─────────────────────
	# A "variable" config carries the VARIABLE_ID itself (an INTEGER), not the
	# name — the name hashes to it, it can't be read back — so the built-in
	# Variables actions work on VARIABLE_IDs.

	def config(self, name: str) -> "Config | None":
		# The config / output `name` of the run as it is, its DataType kept.
		return self._pipeline.find(generate_id(name))

	def target(self, name: str) -> "int | None":
		# The VARIABLE_ID a "variable" config `name` names — None without one.
		config = self.config(name)
		if config is None or config.data_type != DataType.INTEGER:
			return None
		return decode_value(config) & 0xFFFF

	def find_variable(self, variable_id: int) -> "Config | None":
		return self._variables.find(variable_id)

	def store_variable(self, variable_id: int, config: Config) -> bool:
		# False when there's no room for another variable.
		return self._variables.set(variable_id, config)

	def drop_variable(self, variable_id: int) -> bool:
		return self._variables.remove(variable_id)


class TriggerContext(HIOContext):
	# What a trigger sees: its own node's configs (copied when it was armed —
	# not the pipeline, which belongs to whatever branch is running), the
	# workflow variables, and what it publishes when it fires — merged into
	# the pipeline as its branch starts, for the branch's actions to read.

	def __init__(self, configs, variables: "GlobalVariables | None" = None) -> None:
		self._configs = {}
		for config in configs:
			self._configs[config.config_id] = Config(config.config_id, config.data_type, bytes(config.data))
		self._variables = variables if variables is not None else GlobalVariables(0)
		self.results = []               # Config — published with set() since the last poll

	def get(self, name: str):
		config = self._configs.get(generate_id(name))
		if config is not None:
			return decode_value(config)
		return _variable(self._variables, name)

	def set(self, name: str, value) -> None:
		config_id = generate_id(name)
		self.results = [result for result in self.results if result.config_id != config_id]
		self.results.append(encode_value(config_id, value))

	def variable(self, name: str):
		return _variable(self._variables, name)

	def set_variable(self, name: str, value) -> bool:
		return self._variables.set(variable_id(name), encode_value(0, value))

	def remove_variable(self, name: str) -> bool:
		return self._variables.remove(variable_id(name))

	def remove(self, name: str) -> bool:
		config_id = generate_id(name)
		before = len(self.results)
		self.results = [result for result in self.results if result.config_id != config_id]
		return len(self.results) != before

	def stream(self, name: str) -> HIOStream:
		raise HIOStreamError("a trigger has no STREAM configs")

	def same_configs(self, configs) -> bool:
		# Whether `configs` are the ones it was armed with — re-arming with the
		# same ones keeps it as it is (a server stays open).
		if len(configs) != len(self._configs):
			return False
		for config in configs:
			mine = self._configs.get(config.config_id)
			if mine is None or mine.data_type != config.data_type or bytes(mine.data) != bytes(config.data):
				return False
		return True
