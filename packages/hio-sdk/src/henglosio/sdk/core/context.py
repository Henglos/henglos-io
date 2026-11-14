from .stream import HIOStream

class HIOContext:
	# What an action sees while it runs.
	#
	# Values are MicroPython's own types — what the workflow calls integer,
	# float, bool, string, list and object: int, float, bool, str, list, dict
	# (and bytes for a file's or a color's raw bytes).

	# The trigger whose branch the action runs in (its HIOTrigger instance) —
	# None in Start's. Branches run side by side: an action answering its
	# trigger (HTTP's Respond, its request) finds it here.
	origin = None

	def get(self, name: str) -> "int | float | bool | str | list | dict | bytes | None":
		# The value of `name`: this action's own configs first, then whatever
		# previous actions published, then the workflow variable `name`. A
		# config bound to a variable already reads it here — the action never
		# needs to know whether a value is a literal, a bind or a variable.
		# None when there's no such value.
		raise NotImplementedError

	def set(self, name: str, value: "int | float | bool | str | list | dict | bytes") -> None:
		# Publishes `value` under `name`: sent back to the host with this
		# action's response and visible to the next actions (binds).
		raise NotImplementedError

	def remove(self, name: str) -> bool:
		# Drops `name` from the values shared between the actions of the run.
		# Variables aren't touched — see remove_variable.
		raise NotImplementedError

	def variable(self, name: str) -> "int | float | bool | str | list | dict | bytes | None":
		# Only the workflow variable `name` (kept across loops of the program)
		# — for when a config or output of the same name must not shadow it.
		# None while it has no value.
		raise NotImplementedError

	def set_variable(self, name: str, value: "int | float | bool | str | list | dict | bytes") -> bool:
		# Writes the workflow variable `name` — every action and script reads
		# it from then on, across loops. False when there's no room for
		# another variable (the workflow's MAX_VARIABLES).
		raise NotImplementedError

	def remove_variable(self, name: str) -> bool:
		# The workflow variable `name` back to no value. False when it had none.
		raise NotImplementedError

	def stream(self, name: str) -> HIOStream:
		# The STREAM config `name` — see HIOStream (HIOAction.batch is the
		# shortcut for this).
		raise NotImplementedError
