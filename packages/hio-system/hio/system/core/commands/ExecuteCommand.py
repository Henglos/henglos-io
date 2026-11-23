from henglosio.sdk.core import registry
from henglosio.sdk.core.action import HIOAction, SUCCESS, FALLBACK
from henglosio.sdk.core.identifier import generate_id
from ..Context import ActionContext, ScriptContext, PipelineContext, ConversionError, coerce, decode_value, lookup
from ..GlobalVariables import GlobalVariables
from .. import memory
from .. import builtin            # registers the built-in actions (Variables)
from ..builtin import Start, flow
from ..builtin.Start import FlowMode
from ..interfaces.ICommand import ICommand
from ..interfaces.IConfig import IConfig
from ..interfaces.ITransport import ITransport
from ..output import respond, debug
from ..services.PacketCodec import CommandId, OutputId, DebugLevel, Config
from ..services.ScriptEngine import ScriptEngine
from ..services.CommandIngress import TransportChannel
from ..services.FrameReader import FrameReader, FrameLease
from ..packets.ExecutePacket import ExecutePacket
from ..packets.RunPacket import RunPacket
from ..services.BatchStream import BatchStream
from ..services.TriggerService import TriggerService

# Pass Context (an action's Advanced option): a flag among its configs, taken
# out before they reach the pipeline. Without it, the next action is handed
# only what this one published; with it, also everything this one was handed.
_PASS_CONTEXT_ID = generate_id("context/pass")

# The built-in components live in builtin/: Variables (ordinary actions,
# registered when it loads), Start and Flow (If, Switch, Repeat) — those two
# steer the flow, so they're run here rather than through the registry.


def _output_id(result) -> int:
	# What execute() returned -> the RESPONSE's OUTPUT_ID.
	if result is None or result == SUCCESS:
		return OutputId.SUCCESS
	if result == FALLBACK:
		return OutputId.FALLBACK
	if isinstance(result, str):
		return generate_id(result)
	return OutputId.FALLBACK


def _next_instance(outputs, output_id: int) -> int:
	# INSTANCE_ID of the node wired to `output_id`, 0 when none is.
	for output in outputs:
		if output.output_id == output_id:
			return output.target_instance_id
	return 0


class Branch:
	# One run through the flow, from Start or a trigger to a node with nothing
	# wired after it: where it is and what its actions published. Each has
	# its own, so the stored program can run Start's and the triggers'
	# branches at the same time (MainTask) — the variables are what they share.

	def __init__(self, max_entries: int) -> None:
		# What its actions publish, shared down the branch (BINDs read it).
		self.context = PipelineContext(max_entries)

		# INSTANCE_ID the next EXECUTE must carry, from the output the last
		# action ended on. ACTION_ID alone isn't enough to sequence a replay:
		# two nodes of the same action type (a GPIO Write on each branch of an
		# If) share it, only INSTANCE_ID tells them apart. 0: the branch is over.
		self.cursor = 0

		# Repeat's count, by INSTANCE_ID — how many times each Repeat node has
		# gone out Loop in this run. Back to zero on Done and at every start.
		self.repeats = {}

		# The trigger that started it (its INSTANCE_ID, 0 for Start's) — told
		# when it ends, so it can wrap up (answer a request nobody answered) —
		# and its instance, for the actions (context.origin: Respond's request).
		self.trigger = 0
		self.origin = None


# Port of the C++ Commands::Execute: runs one action, then answers with the
# output it ended on and whatever it published.
class ExecuteCommand(ICommand):

	def __init__(self, config: IConfig, reader: FrameReader) -> None:
		self._reader = reader               # BatchStream reads STREAM chunks through it
		self._stream_timeout_ms = config.STREAM_TIMEOUT_MS
		self._actions = {}                  # ACTION_ID -> action instance, created on first run

		# The workflow's variables (kept across loops and shared by every
		# branch) and the scripts of CODE configs.
		self._max_entries = config.MAX_CONTEXT_ENTRIES
		self._variables = GlobalVariables(config.MAX_VARIABLES)
		self._scripts = ScriptEngine(config.MAX_SCRIPT_CACHE)

		# Set by "core/start". LOOP, not UNKNOWN: a start without a
		# "start/mode" config still needs a sane mode to run under.
		self._flow_mode = FlowMode.LOOP
		self._first_flow = False

		# The triggers the program armed.
		self.triggers = TriggerService(self._variables)

		# The branch commands run in: `main` — the host's, one at a time —
		# unless the stored program's playback picked another (use()), running
		# Start's and the triggers' branches side by side.
		self.main = Branch(self._max_entries)
		self._current = self.main

	# --- the branch being run (see Branch)

	@property
	def _context(self) -> PipelineContext:
		return self._current.context

	@property
	def _expected_instance_id(self) -> int:
		return self._current.cursor

	@_expected_instance_id.setter
	def _expected_instance_id(self, instance_id: int) -> None:
		self._current.cursor = instance_id

	@property
	def _repeats(self) -> dict:
		return self._current.repeats

	@property
	def cursor(self) -> int:
		# INSTANCE_ID of the node the host's flow runs next, 0 between branches.
		return self.main.cursor

	def branch(self) -> "Branch":
		# A new branch for the playback to run side by side with the others.
		return Branch(self._max_entries)

	def use(self, branch: "Branch | None") -> None:
		# The branch the next command runs in — None: the host's. Only until
		# that command first waits (see _run): whatever runs meanwhile is the host's.
		self._current = branch if branch is not None else self.main

	async def execute(self, packet: ExecutePacket, transport: "ITransport | None", channel: "TransportChannel | None" = None, lease: "FrameLease | None" = None) -> None:
		# `channel`/`lease`: where the EXECUTE came in and its frame's bytes
		# there — needed only when the action reads STREAM configs (see
		# BatchStream). None for a frame of the stored program.

		if packet.action_id == Start.ACTION_ID:
			self._start(packet, transport)
			return

		# A trigger's node isn't a step: it's armed, wherever the flow is.
		if self.triggers.is_trigger(packet.action_id):
			self._arm(packet, transport, CommandId.EXECUTE)
			return

		if packet.instance_id != self._expected_instance_id:
			debug(transport, DebugLevel.WARN, "[Execute] skip instanceId=0x%04x expected=0x%04x" % (packet.instance_id, self._expected_instance_id))
			return

		await self._dispatch(packet, transport, channel, lease, CommandId.EXECUTE, True)

	async def run(self, packet: RunPacket, transport: "ITransport | None", channel: "TransportChannel | None" = None, lease: "FrameLease | None" = None) -> None:
		# RUN: the action alone, whatever the flow expects next — no
		# INSTANCE_ID check, and the flow's position is left where it was, so a
		# program interrupted by it carries on as if nothing ran. Answered like
		# an EXECUTE (output + what it published), under COMMAND_ID RUN.
		#
		# "core/start" only seeds the variables here: no mode, no flow.
		if packet.action_id == Start.ACTION_ID:
			self._initialize_variables(packet, transport)
			respond(transport, packet.frame_id, CommandId.RUN, OutputId.SUCCESS)
			return

		if self.triggers.is_trigger(packet.action_id):
			self._arm(packet, transport, CommandId.RUN)
			return

		await self._dispatch(packet, transport, channel, lease, CommandId.RUN, False)

	async def _dispatch(self, packet: "ExecutePacket | RunPacket", transport: "ITransport | None", channel: "TransportChannel | None", lease: "FrameLease | None", command_id: int, sequence: bool) -> None:
		# What EXECUTE and RUN share past their own checks. `sequence`: the
		# action is a step of the flow — its output picks the next instance.

		step = flow.ACTIONS.get(packet.action_id)
		if step is not None:
			self._logic(step, packet, transport, command_id, sequence)
			return

		action = self._instance(packet.action_id, transport)
		if action is None:
			if sequence:
				self._advance(_next_instance(packet.outputs, OutputId.ACTION_NOT_FOUND))
			respond(transport, packet.frame_id, command_id, OutputId.ACTION_NOT_FOUND)
			return

		if packet.streams and (channel is None or lease is None):
			debug(transport, DebugLevel.ERROR, "[Execute] frameId=0x%04x streams need a live channel" % packet.frame_id)
			respond(transport, packet.frame_id, command_id, OutputId.FALLBACK)
			return

		# Configs the action reads that this node may leave empty: dropped first,
		# so it can't read another node's leftover under the same name.
		pipeline = self._context
		for name in action.clears:
			pipeline.remove(generate_id(name))

		context = self._prepare(packet, transport, channel)
		if context.failed:
			if packet.streams:
				lease.release()
			self._fall_back(packet, transport, command_id, sequence)
			return

		# Everything _run needs is copied out of the packet by now — its
		# configs went into the pipeline, outputs are plain ints. The EXECUTE's
		# own bytes can go: its stream chunks come right after them, and the
		# action reads those off the channel itself (BatchStream). Always
		# inline — nothing else may run until this action is done.
		if packet.streams:
			lease.release()

		await self._run(action, context, transport, packet.frame_id, packet.outputs, command_id, sequence)

	def set_context(self, configs) -> bool:
		# CONTEXT_SET: values written straight into the pipeline, as if an
		# action had published them. False when some didn't fit.
		stored = True
		for config in configs:
			stored = self._context.merge(config) and stored
		return stored

	def forget(self, action_id: int) -> None:
		# Drops the cached instance, e.g. once its component is removed.
		self._actions.pop(action_id, None)

	def resetFlow(self) -> None:
		# A new program was recorded: its own "core/start" sets the mode and
		# the initial values of its variables, its own triggers get armed.
		self.restart()
		self._flow_mode = FlowMode.UNKNOWN
		self._variables.clear()

	def restart(self) -> None:
		# The program plays from its beginning again: no branch running, no
		# trigger armed, a ONCE Start due to run again.
		self.abandon()
		self.triggers.disarm_all()
		self._repeats.clear()
		self._first_flow = False

	def wants_start(self) -> bool:
		# Whether "core/start" would start a branch: always in LOOP, only the
		# first time in ONCE (after that the board only answers triggers).
		return not (self._flow_mode == FlowMode.ONCE and self._first_flow)

	def fire(self, transport: "ITransport | None" = None):
		# The host's branch, between branches: the first armed trigger that
		# fired starts it — what it published goes into the pipeline, the flow
		# points at its Out. (INSTANCE_ID, results) of it, or None when none
		# fired (or a branch is still running).
		if self.main.cursor != 0:
			return None

		fired = self.triggers.poll()
		if fired is None:
			return None

		instance_id, target, results = fired
		self._begin(self.main, instance_id, results)
		debug(transport, DebugLevel.INFO, "[Trigger] instanceId=0x%04x fired next=0x%04x" % (instance_id, target))
		self._end_or_go(self.main, target)
		return instance_id, results

	def fire_branch(self, busy) -> "Branch | None":
		# The stored program's playback: a trigger that fired — and isn't in
		# `busy` (the INSTANCE_IDs whose branch still runs: one at a time per
		# trigger) — as a new branch of its own, pointing at its Out. None
		# when none fired, or the one that did has nothing wired out.
		fired = self.triggers.poll(busy)
		if fired is None:
			return None

		instance_id, target, results = fired
		branch = self.branch()
		self._begin(branch, instance_id, results)
		self._end_or_go(branch, target)
		return branch if branch.cursor else None

	def _begin(self, branch: "Branch", instance_id: int, results) -> None:
		# A branch starts with an empty pipeline — what another branch left
		# would fill it (what carries over between branches is a variable) —
		# holding what its trigger published.
		branch.context.clear()
		for result in results:
			branch.context.merge(result)
		branch.repeats.clear()
		branch.trigger = instance_id
		branch.origin = self.triggers.instance(instance_id)

	def _end_or_go(self, branch: "Branch", target: int) -> None:
		current = self._current
		self._current = branch
		try:
			self._advance(target)
		finally:
			self._current = current

	def abandon(self) -> None:
		# Drops the running branch, if any — the host walked away from it, or
		# the stored program has no node where it points.
		self._advance(0)

	def _advance(self, instance_id: int) -> None:
		# The flow's next node; 0 ends the branch — its trigger is told.
		branch = self._current
		branch.cursor = instance_id
		if instance_id == 0 and branch.trigger != 0:
			trigger = branch.trigger
			branch.trigger = 0
			branch.origin = None
			self.triggers.finish(trigger)

	def _arm(self, packet: "ExecutePacket | RunPacket", transport: "ITransport | None", command_id: int) -> None:
		armed = self.triggers.arm(packet)
		if not armed:
			debug(transport, DebugLevel.ERROR, "[Trigger] instanceId=0x%04x arm failed: %r" % (packet.instance_id, self.triggers.lastError))
		respond(transport, packet.frame_id, command_id, OutputId.SUCCESS if armed else OutputId.FALLBACK)

	def _start(self, packet: ExecutePacket, transport: "ITransport | None") -> None:
		# "core/start": no action behind it — it sets the flow mode, gates a
		# ONCE program to its first run and points at the first real node.

		# Whatever branch was running is over: Start begins its own, with an
		# empty pipeline (see fire).
		self.abandon()
		self._context.clear()

		if not self._first_flow:
			self._configure(packet)

		self._initialize_variables(packet, transport)

		# A new run: every Repeat counts from the start again (one left
		# mid-loop by the last run doesn't carry its count over).
		self._repeats.clear()

		self._expected_instance_id = 0

		if self._flow_mode == FlowMode.ONCE:
			if self._first_flow:
				return
			self._first_flow = True
		elif self._flow_mode == FlowMode.LOOP:
			self._first_flow = False

		self._advance(_next_instance(packet.outputs, OutputId.SUCCESS))

		debug(transport, DebugLevel.INFO, "[Execute] start mode=%s next=0x%04x" % (
			"loop" if self._flow_mode == FlowMode.LOOP else "once", self._expected_instance_id))
		respond(transport, packet.frame_id, CommandId.EXECUTE, OutputId.SUCCESS)

	def _configure(self, packet: ExecutePacket) -> None:
		# "start/mode" config: "once" or "loop". Absent -> mode unchanged.
		mode = Start.mode(packet.configs)
		if mode is not None:
			self._flow_mode = mode

	def _initialize_variables(self, packet: ExecutePacket, transport: "ITransport | None") -> None:
		# Every other literal of "core/start" is a variable's initial value,
		# CONFIG_ID = its VARIABLE_ID. Only an unset variable takes it: a loop
		# back to the start keeps what the program wrote.
		for config in packet.configs:
			if config.config_id == Start.MODE_ID:
				continue
			if not self._variables.initialize(config.config_id, config):
				debug(transport, DebugLevel.WARN, "[Variable] 0x%04x not initialized: no room" % config.config_id)

	def _logic(self, step, packet: "ExecutePacket | RunPacket", transport: "ITransport | None", command_id: int, sequence: bool) -> None:
		# "logic/if", "logic/switch", "logic/repeat" (builtin/flow): their
		# configs resolved like any action's (literal, BIND, VARIABLE, CODE),
		# then `step` picks the output they go out on.

		pipeline = self._context
		for config_id in step.CONFIG_IDS:
			pipeline.remove(config_id)
		context = self._prepare(packet, transport, None)
		if context.failed:
			self._fall_back(packet, transport, command_id, sequence)
			return

		def read(config_id: int):
			config = pipeline.find(config_id)
			return None if config is None else decode_value(config)

		# "{{ name }}" in a condition: what ctx.get(name) would read.
		def find(name: str):
			return lookup(pipeline, self._variables, name)

		output_id, results = step.evaluate(read, packet.instance_id, self._repeats, sequence, find)
		for result in results or ():
			pipeline.merge(result)

		debug(transport, DebugLevel.INFO, "[Logic] actionId=0x%04x -> output=0x%04x" % (packet.action_id, output_id))

		if sequence:
			self._hand_on(context, results)
			self._advance(_next_instance(packet.outputs, output_id))
		respond(transport, packet.frame_id, command_id, output_id, results)

	def _instance(self, action_id: int, transport: "ITransport | None") -> "HIOAction | None":
		action = self._actions.get(action_id)
		if action is not None:
			return action

		action_class = registry.find(action_id)
		if action_class is None:
			return None

		try:
			action = action_class()
			action.initialize()
		except Exception as error:
			debug(transport, DebugLevel.ERROR, "[Execute] actionId=0x%04x initialize failed: %r" % (action_id, error))
			return None

		self._actions[action_id] = action
		return action

	def _prepare(self, packet: ExecutePacket, transport: "ITransport | None", channel: "TransportChannel | None") -> ActionContext:
		# Publishes the action's own configs (resolving BINDs from what earlier
		# actions published, running CODE scripts) into the pipeline — copied, since the packet's
		# values are views into the frame buffer — and opens its streams.

		pipeline = self._context
		passes = False

		for config in packet.configs:
			if config.config_id == _PASS_CONTEXT_ID:
				passes = True
				continue
			if not pipeline.merge(config):
				debug(transport, DebugLevel.WARN, "[Execute] configId=0x%04x dropped: the pipeline is full" % config.config_id)

		# What a BIND or a VARIABLE brings is converted to what the action wants
		# (EXPECTED_TYPE). One that can't be: the action doesn't run, it goes out
		# Fallback — and the studio is told which config, on which node, and why.
		failed = False

		def converted(config: Config, expected: int) -> "Config | None":
			try:
				return coerce(config, expected)
			except ConversionError as error:
				debug(transport, DebugLevel.ERROR, "[Convert] instanceId=0x%04x configId=0x%04x %s" % (packet.instance_id, config.config_id, error))
				return None

		for bind in packet.binds:
			source = pipeline.find(bind.source_id)
			if source is None:
				debug(transport, DebugLevel.WARN, "[Bind] configId=0x%04x sourceId=0x%04x not found" % (bind.config_id, bind.source_id))
				continue
			config = converted(Config(bind.config_id, source.data_type, source.data), bind.expected_type)
			if config is None:
				failed = True
				continue
			pipeline.merge(config)

		variables = self._variables
		for link in packet.variables:
			value = variables.find(link.variable_id)
			if value is None:
				debug(transport, DebugLevel.WARN, "[Variable] configId=0x%04x variableId=0x%04x has no value" % (link.config_id, link.variable_id))
				continue
			config = converted(Config(link.config_id, value.data_type, value.data), link.expected_type)
			if config is None:
				failed = True
				continue
			pipeline.merge(config)

		# CODE configs last: their scripts can read the configs, binds and variables above.
		if packet.codes:
			scriptContext = ScriptContext(pipeline, variables)
			for code in packet.codes:
				config = self._scripts.evaluate(code, scriptContext)
				if config is None:
					debug(transport, DebugLevel.WARN, "[Code] configId=0x%04x error: %s" % (code.config_id, self._scripts.lastError))
					continue
				pipeline.merge(config)

		streams = {}
		for link in packet.streams:
			streams[link.config_id] = BatchStream(self._reader, channel, packet.frame_id, link, self._stream_timeout_ms)

		context = ActionContext(pipeline, streams, variables)
		context.origin = self._current.origin
		context.passes = passes
		context.failed = failed
		return context

	def _fall_back(self, packet: "ExecutePacket | RunPacket", transport: "ITransport | None", command_id: int, sequence: bool) -> None:
		# The action can't run — a config's value couldn't be converted: out Fallback.
		if sequence:
			self._advance(_next_instance(packet.outputs, OutputId.FALLBACK))
		respond(transport, packet.frame_id, command_id, OutputId.FALLBACK)

	def _hand_on(self, context: ActionContext, results) -> None:
		# What the next action of the branch gets: everything as it is (Pass
		# Context), or only what this one published — its configs and what it
		# was handed stop here. Keeps the pipeline to what's actually used.
		if context.passes:
			return
		pipeline = self._context
		pipeline.clear()
		for result in results or ():
			pipeline.merge(result)

	async def _run(self, action: HIOAction, context: ActionContext, transport: "ITransport | None", frame_id: int, outputs, command_id: int = CommandId.EXECUTE, sequence: bool = True) -> None:

		output_id = OutputId.FALLBACK

		# While the action waits, other branches (and the host's commands) run
		# — in their own branch: this one's back once it's done.
		branch = self._current
		self._current = self.main

		try:
			action.context = context
			# The action starts with all the memory there is — see memory.py.
			memory.collect()
			output_id = _output_id(await action.execute(context))
		except Exception as error:
			debug(transport, DebugLevel.ERROR, "[Execute] frameId=0x%04x failed: %r" % (frame_id, error))
		finally:
			self._current = branch
			# The chunk an action still holds is answered now, and whatever
			# it didn't read is left to the main loop (NOT_FOUND).
			for stream in context.streams():
				stream.close()

		if sequence:
			self._hand_on(context, context.results)
			self._advance(_next_instance(outputs, output_id))
		respond(transport, frame_id, command_id, output_id, context.results)
