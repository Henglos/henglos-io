from ....sdk.core import registry
from ....sdk.core.trigger import HIOTrigger
from ..Context import TriggerContext
from ..GlobalVariables import GlobalVariables
from .PacketCodec import OutputId


class _Armed:
	# One armed trigger node: its instance, what it sees and where its Out leads.

	def __init__(self, action_id: int, trigger: HIOTrigger, context: TriggerContext, target: int) -> None:
		self.action_id = action_id
		self.trigger = trigger
		self.context = context
		self.target = target            # INSTANCE_ID wired to its Out, 0 when nothing is


def trigger_class(action_id: int):
	# The trigger class behind `action_id` — a component's (@trigger) — or
	# None when it isn't a trigger. There are no built-in ones: Timer and Pin
	# are the Time and GPIO components'.
	return registry.find(action_id) if registry.is_trigger(action_id) else None


class TriggerService:
	# The armed triggers, by INSTANCE_ID of their node. Nothing runs in the
	# background: poll() asks each one in turn (round-robin, so a busy one
	# can't starve the others) whether it fired, and only while no branch is
	# running — an event that comes meanwhile waits in the trigger itself (a
	# pin's flag, a request in the socket's backlog).

	def __init__(self, variables: GlobalVariables) -> None:
		self._variables = variables
		self._armed = {}                # INSTANCE_ID -> _Armed
		self._order = []                # INSTANCE_IDs, in the order poll() asks them
		self._next = 0                  # index in _order poll() starts from
		self.lastError = None           # what the last arm()/poll() that failed raised

	def is_trigger(self, action_id: int) -> bool:
		return trigger_class(action_id) is not None

	def armed(self) -> int:
		return len(self._armed)

	def arm(self, packet) -> bool:
		# Arms the node of an EXECUTE (or RECORDed frame) of a trigger. Again
		# with the same configs only follows the new wiring — a server stays
		# open; other configs re-arm it from scratch. False when it failed.
		instance_id = packet.instance_id
		target = 0
		for output in packet.outputs:
			if output.output_id == OutputId.SUCCESS:
				target = output.target_instance_id

		armed = self._armed.get(instance_id)
		if armed is not None and armed.action_id == packet.action_id and armed.context.same_configs(packet.configs):
			armed.target = target
			return True

		self.disarm(instance_id)

		cls = trigger_class(packet.action_id)
		if cls is None:
			return False

		context = TriggerContext(packet.configs, self._variables)
		try:
			trigger = cls()
			trigger.context = context
			trigger.initialize()
			trigger.arm(context)
		except Exception as error:
			self.lastError = error
			return False

		self._armed[instance_id] = _Armed(packet.action_id, trigger, context, target)
		self._order.append(instance_id)
		return True

	def instance(self, instance_id: int) -> "HIOTrigger | None":
		armed = self._armed.get(instance_id)
		return None if armed is None else armed.trigger

	def poll(self, busy=()):
		# One round over the armed triggers — but those in `busy` (INSTANCE_IDs
		# whose branch still runs) — the first that fired, as
		# (INSTANCE_ID, target, results), or None. Never blocks.
		count = len(self._order)
		for step in range(count):
			index = (self._next + step) % count
			instance_id = self._order[index]
			if instance_id in busy:
				continue
			armed = self._armed[instance_id]
			context = armed.context
			context.results = []
			try:
				fired = armed.trigger.poll(context)
			except Exception as error:
				self.lastError = error
				fired = False
			if fired:
				self._next = (index + 1) % count
				return instance_id, armed.target, context.results
		return None

	def finish(self, instance_id: int) -> None:
		# The branch `instance_id` started is over.
		armed = self._armed.get(instance_id)
		if armed is None:
			return
		try:
			armed.trigger.finish(armed.context)
		except Exception as error:
			self.lastError = error

	def disarm(self, instance_id: int) -> None:
		armed = self._armed.pop(instance_id, None)
		if armed is None:
			return
		self._order.remove(instance_id)
		self._next = 0
		try:
			armed.trigger.disarm()
		except Exception as error:
			self.lastError = error

	def disarm_all(self) -> None:
		for instance_id in list(self._order):
			self.disarm(instance_id)
