from .context import HIOContext


class HIOTrigger:
	# Base of every trigger — a node that starts a branch of the flow when
	# something happens (a request comes in, a pin changes, a code is
	# received), instead of being reached by a wire. Subclass it, implement
	# poll() and register the class with @trigger("<component>/<trigger>"):
	#
	#   @trigger("ir/code trigger")
	#   class CodeTrigger(HIOTrigger):
	#
	#       def arm(self, context) -> None:
	#           self.receiver = Receiver(context.get("code trigger/rx pin"))
	#
	#       def poll(self, context) -> bool:
	#           code = self.receiver.code()
	#           if code is None:
	#               return False
	#           context.set("code", code)
	#           return True
	#
	# One instance per trigger NODE (two Timers are two instances, each with
	# its own configs), created when the program arms it. The runtime runs one
	# branch at a time: while a branch runs, an event waits in the trigger
	# itself (a pin's edge flag, a request in the socket's queue) until poll()
	# is asked again.

	# Set by the runtime before each call — the same object the call receives.
	context: HIOContext

	def initialize(self) -> None:
		# Called once, right after the instance is created. Optional.
		pass

	def arm(self, context: HIOContext) -> None:
		# The program starts listening: read the configs (context.get), open
		# what it listens on (a socket, an IRQ). Called again when the host
		# re-arms it with other configs — after disarm(). Optional.
		pass

	def poll(self, context: HIOContext) -> bool:
		# Whether it fired since the last call — publishing what happened with
		# context.set(), which the branch's actions read like any output.
		# Must NOT block: it's asked over and over while the board is idle.
		raise NotImplementedError

	def finish(self, context: HIOContext) -> None:
		# The branch it started is over (its last action had nothing wired
		# after it) — e.g. answer a request nobody answered. Optional.
		pass

	def disarm(self) -> None:
		# Stop listening: close what arm() opened. Optional.
		pass
