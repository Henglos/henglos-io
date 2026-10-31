from .context import HIOContext
from .stream import HIOStream


# Outputs an action can end on — execute() returns one of these, or the name
# of one of its own custom outputs (see HIOAction.execute).
SUCCESS = "success"
FALLBACK = "fallback"


class HIOAction:
	# Base of every action. Subclass it, implement execute() and register the
	# class with @action("<component>/<action>") (see registry.py):
	#
	#   @action("leds/set")
	#   class SetLeds(HIOAction):
	#
	#       def initialize(self) -> None:
	#           self.strip = Strip(pin=5)
	#
	#       async def execute(self, context) -> str:
	#           self.strip.brightness(context.get("brightness"))
	#           async for chunk in self.batch("leds"):
	#               self.strip.write(chunk)
	#           return SUCCESS
	#
	# One instance per action type, created the first time it runs and reused
	# for every execution after that.

	# Set by the runtime before each execute() — the same object execute()
	# receives, kept here so helpers like batch() can reach it.
	context: HIOContext

	def initialize(self) -> None:
		# Called once, right after the instance is created. Optional.
		pass

	async def execute(self, context: HIOContext) -> "str | None":
		# Runs the action. Returns the output it ended on: SUCCESS (or None),
		# FALLBACK, or the name of a custom output. Values published with
		# context.set() go back to the host and to the next actions.
		raise NotImplementedError

	def batch(self, name: str) -> HIOStream:
		# The STREAM config `name`, arriving in chunks while this runs:
		#   async for chunk in self.batch("leds"): ...
		# See HIOStream for how long each chunk stays valid.
		return self.context.stream(name)
