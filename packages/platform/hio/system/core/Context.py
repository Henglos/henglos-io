import json
import struct

from ...sdk.core.context import HIOContext
from ...sdk.core.stream import HIOStream, HIOStreamError
from ...sdk.core.identifier import generate_id, variable_id
from .services.PacketCodec import Config, DataType, size_of_data_type
from .GlobalVariables import GlobalVariables


# struct format of each single-element DataType that has a Python value.
# The reduced FLOAT_8/FLOAT_16 and the UFLOAT_* types have no standard
# packing, so they come back as raw bytes.
_FORMATS = {
	DataType.UINT_8: "<B",
	DataType.UINT_16: "<H",
	DataType.UINT_32: "<I",
	DataType.INT_8: "<b",
	DataType.INT_16: "<h",
	DataType.INT_32: "<i",
	DataType.FLOAT_32: "<f",
}


def decode_value(config: Config) -> "int | float | bool | bytes | list | dict":
	# A Config's bytes as a Python value, by its DataType: a number, a bool, a
	# list or a dict (JSON) — or the raw bytes for text, arrays and the types
	# with no packing. The inverse of encode_value.
	data = config.data

	# A list or an object — its JSON. Unreadable: the raw bytes, as before.
	if config.data_type == DataType.JSON:
		try:
			return json.loads(bytes(data))
		except ValueError:
			return bytes(data)

	if not config.is_array and len(data) == size_of_data_type(config.data_type):

		if config.data_type == DataType.BOOL:
			return data[0] != 0

		fmt = _FORMATS.get(config.data_type)
		if fmt is not None:
			return struct.unpack(fmt, data)[0]

	return bytes(data)


def encode_value(config_id: int, value) -> Config:
	# A Python value as a Config under `config_id` — what an action's
	# context.set() publishes: bool, INT_32, FLOAT_32, text and bytes as a
	# UINT_8 array, lists and dicts as JSON.
	# bool before int: bool is an int subclass.
	if isinstance(value, bool):
		return Config(config_id, DataType.BOOL, b"\x01" if value else b"\x00")
	if isinstance(value, int):
		return Config(config_id, DataType.INT_32, struct.pack("<i", value))
	if isinstance(value, float):
		return Config(config_id, DataType.FLOAT_32, struct.pack("<f", value))
	if isinstance(value, str):
		return Config(config_id, DataType.UINT_8, value.encode(), True)
	# A list or an object (a tuple too) — as its JSON. bytes stay bytes.
	if isinstance(value, (list, tuple, dict)):
		return Config(config_id, DataType.JSON, json.dumps(value).encode(), True)
	return Config(config_id, DataType.UINT_8, bytes(value), True)


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
		self._values[config.config_id] = Config(config.config_id, config.data_type, bytes(config.data), config.is_array)
		return True

	def remove(self, config_id: int) -> bool:
		return self._values.pop(config_id, None) is not None

	def clear(self) -> None:
		self._values.clear()


def _variable(variables: GlobalVariables, name: str) -> "int | float | bool | bytes | None":
	# A workflow variable's value, by its name — None when it isn't set.
	config = variables.find(variable_id(name))
	return None if config is None else decode_value(config)


def _get(pipeline: PipelineContext, variables: GlobalVariables, name: str) -> "int | float | bool | bytes | None":
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

	def get(self, name: str) -> "int | float | bool | bytes | None":
		return _get(self._pipeline, self._variables, name)

	def var(self, name: str) -> "int | float | bool | bytes | None":
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

	def get(self, name: str) -> "int | float | bool | bytes | None":
		return _get(self._pipeline, self._variables, name)

	def set(self, name: str, value) -> None:
		config = encode_value(generate_id(name), value)
		self._pipeline.merge(config)
		self.results.append(config)

	def variable(self, name: str) -> "int | float | bool | bytes | None":
		return _variable(self._variables, name)

	def remove(self, name: str) -> bool:
		# Only the run's values: variables are fixed — only a Set changes one,
		# and only recording a new program clears them.
		return self._pipeline.remove(generate_id(name))

	def stream(self, name: str) -> HIOStream:
		stream = self._streams.get(generate_id(name))
		if stream is None:
			raise HIOStreamError("'%s' is not a STREAM config of this execution" % name)
		return stream

	def streams(self):
		# Every stream of this execution — the runtime closes them once the action ends.
		return self._streams.values()


class TriggerContext(HIOContext):
	# What a trigger sees: its own node's configs (copied when it was armed —
	# not the pipeline, which belongs to whatever branch is running), the
	# workflow variables, and what it publishes when it fires — merged into
	# the pipeline as its branch starts, for the branch's actions to read.

	def __init__(self, configs, variables: "GlobalVariables | None" = None) -> None:
		self._configs = {}
		for config in configs:
			self._configs[config.config_id] = Config(config.config_id, config.data_type, bytes(config.data), config.is_array)
		self._variables = variables if variables is not None else GlobalVariables(0)
		self.results = []               # Config — published with set() since the last poll

	def get(self, name: str) -> "int | float | bool | bytes | None":
		config = self._configs.get(generate_id(name))
		if config is not None:
			return decode_value(config)
		return _variable(self._variables, name)

	def set(self, name: str, value) -> None:
		config_id = generate_id(name)
		self.results = [result for result in self.results if result.config_id != config_id]
		self.results.append(encode_value(config_id, value))

	def variable(self, name: str) -> "int | float | bool | bytes | None":
		return _variable(self._variables, name)

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
