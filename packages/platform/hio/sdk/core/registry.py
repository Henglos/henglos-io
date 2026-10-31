from .action import HIOAction
from .trigger import HIOTrigger
from .identifier import generate_id


# ACTION_ID -> action (or trigger) class. ACTION_ID is
# generate_id("<component>/<action>"), the same id the host puts in every EXECUTE.
_actions = {}


def action(name: str):
	# Class decorator registering an action under "<component>/<action>":
	#
	#   @action("leds/set")
	#   class SetLeds(HIOAction): ...
	#
	# Rejects, at import time, a class that doesn't inherit HIOAction or
	# doesn't implement execute() — MicroPython has no abc to do it for us.
	def register(cls):

		if not issubclass(cls, HIOAction):
			raise TypeError("@action('%s'): %s must inherit from HIOAction" % (name, cls.__name__))

		if cls.execute is HIOAction.execute:
			raise TypeError("@action('%s'): %s must implement execute()" % (name, cls.__name__))

		_actions[generate_id(name)] = cls
		return cls

	return register


def trigger(name: str):
	# Class decorator registering a trigger under "<component>/<trigger>" —
	# in the same id space as actions: its node's EXECUTE carries this id, and
	# the runtime arms it instead of running it (see TriggerService).
	#
	#   @trigger("http/request trigger")
	#   class RequestTrigger(HIOTrigger): ...
	def register(cls):

		if not issubclass(cls, HIOTrigger):
			raise TypeError("@trigger('%s'): %s must inherit from HIOTrigger" % (name, cls.__name__))

		if cls.poll is HIOTrigger.poll:
			raise TypeError("@trigger('%s'): %s must implement poll()" % (name, cls.__name__))

		_actions[generate_id(name)] = cls
		return cls

	return register


def is_trigger(action_id: int) -> bool:
	# Whether the class registered under `action_id` is a trigger.
	cls = _actions.get(action_id)
	return cls is not None and issubclass(cls, HIOTrigger)


def find(action_id: int):
	# The action class registered under `action_id`, or None.
	return _actions.get(action_id)


def unregister(action_id: int) -> None:
	# Forgets the class under `action_id` — its component was removed.
	_actions.pop(action_id, None)
