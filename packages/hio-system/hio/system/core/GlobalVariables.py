from .services.PacketCodec import Config


class GlobalVariables:
	# The workflow's variables, by VARIABLE_ID (generate_id("var/<name>"),
	# lowercased) — written by the "variables/set" action, read by VARIABLE
	# configs (VALUE_TYPE 0x04) and by scripts through ctx.var(name).
	#
	# Kept apart from the PipelineContext on purpose: the pipeline holds every
	# config and output of the run, is never emptied and stops taking new
	# entries once full — a variable living there could be crowded out by
	# whatever the program happened to publish first. Here only variables
	# compete for room, and they survive every loop of the program until a new
	# one is recorded (clear()). Values are copied in, never views into a frame.

	def __init__(self, max_entries: int) -> None:
		self._values = {}
		self._max_entries = max_entries

	def find(self, variable_id: int) -> "Config | None":
		return self._values.get(variable_id)

	def set(self, variable_id: int, config: Config) -> bool:
		# Replaces the value, or adds the variable while there's room. False
		# when it didn't fit — the caller reports it.
		if variable_id not in self._values and len(self._values) >= self._max_entries:
			return False
		self._values[variable_id] = Config(variable_id, config.data_type, bytes(config.data))
		return True

	def remove(self, variable_id: int) -> bool:
		# Back to no value — Start's initial value seeds it again on the next
		# recording, a Set writes it again. False when it had none.
		return self._values.pop(variable_id, None) is not None

	def initialize(self, variable_id: int, config: Config) -> bool:
		# The program's initial value — only for a variable without one yet,
		# so a loop coming back to "core/start" keeps what the program wrote.
		if variable_id in self._values:
			return True
		return self.set(variable_id, config)

	def clear(self) -> None:
		self._values.clear()

	def __len__(self) -> int:
		return len(self._values)
