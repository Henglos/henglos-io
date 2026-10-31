import asyncio

from ..compat import sleep_ms
from ..services.CommandIngress import CommandIngress
from ..services.ControlPlane import ControlPlane
from ..services.FrameReader import FrameReader
from ..services.ProgramStorage import ProgramStorage
from ..commands.ExecuteCommand import START_ACTION_ID

# Pause after an update that found nothing to run, so an idle loop lets the
# other tasks run instead of spinning.
_IDLE_MS = 1

# Start's key among the branches running (a trigger's is its INSTANCE_ID, never 0).
_START = 0


class MainTask:
	# Runs the host's frames, and starts the stored program's branches — each
	# a task of its own, so Start's loop and the triggers' branches run side
	# by side. Each branch keeps its own place and pipeline (ExecuteCommand's
	# Branch); a command only runs until its action first waits, so two
	# never interleave half-way through what they share.

	def __init__(self, commandIngress: CommandIngress, frameReader: FrameReader, controlPlane: ControlPlane, programStorage: ProgramStorage) -> None:
		self.commandIngress = commandIngress
		self.frameReader = frameReader
		self.controlPlane = controlPlane
		self.programStorage = programStorage
		# The stored program's branches running: _START or a trigger's INSTANCE_ID -> its task.
		self._branches = {}

	async def run(self) -> None:

		while True:
			# Awaiting a coroutine doesn't yield to the event loop by itself:
			# the sleep is what lets the other tasks in.
			await sleep_ms(0 if await self.update() else _IDLE_MS)

	async def update(self) -> bool:
		# True when at least one frame was dispatched.

		dispatched = False

		self.commandIngress.update()

		for channel in self.commandIngress.channels:
			if not self.commandIngress.hasData(channel): continue

			frame = self.frameReader.poll(channel)
			if frame is None: continue

			# The frame is a view into the channel's buffer: released once the
			# dispatch is done with it — or earlier, by the command itself (an
			# EXECUTE whose action reads streams). `finally` so a dispatch that
			# raises still drops the frame instead of re-running it forever.
			lease = self.frameReader.lease(channel, frame)
			try:
				await self.controlPlane.dispatch(frame, channel, lease)
			finally:
				lease.release()

			dispatched = True

		if self.controlPlane.isPlaying:
			if await self._play():
				dispatched = True
		elif self._branches:
			self._stop_branches()

		return dispatched

	async def _play(self) -> bool:
		# The stored program: Start's branch (every time round in LOOP, once in
		# ONCE) and each trigger's — started here, run side by side as tasks of
		# their own (an action that waits lets the others go on). A trigger
		# fires again only once its last branch is over. True when one started.
		storage = self.programStorage
		control = self.controlPlane
		execute = control.execute

		if not storage.indexed:
			# Played from the start (boot, STANDALONE, a new recording): every
			# trigger of the program is armed first.
			self._stop_branches()
			execute.restart()
			if not storage.index(execute.triggers.is_trigger, START_ACTION_ID):
				return False
			for offset in storage.triggers:
				frame = storage.frame_at_offset(offset)
				if frame is not None:
					await control.dispatch(frame)
			return True

		started = False

		if _START not in self._branches and storage.start is not None and execute.wants_start():
			self._branches[_START] = asyncio.create_task(self._start_branch())
			started = True

		branch = execute.fire_branch(self._branches)
		if branch is not None:
			key = branch.trigger
			self._branches[key] = asyncio.create_task(self._trigger_branch(branch))
			started = True

		return started

	async def _start_branch(self) -> None:
		# Start, then its branch — again and again in LOOP.
		storage = self.programStorage
		execute = self.controlPlane.execute
		branch = execute.branch()
		try:
			while execute.wants_start():
				frame = storage.frame_at_offset(storage.start)
				if frame is None:
					return
				await self._step(branch, frame)
				await self._walk(branch)
				# A Start with nothing after it doesn't hold the board.
				await sleep_ms(_IDLE_MS)
		finally:
			self._branches.pop(_START, None)

	async def _trigger_branch(self, branch) -> None:
		# Its key now: the branch forgets its trigger once it ends.
		key = branch.trigger
		try:
			await self._walk(branch)
		finally:
			self._branches.pop(key, None)

	async def _walk(self, branch) -> None:
		# The branch's nodes, one after the other, until one has nothing after it.
		storage = self.programStorage
		execute = self.controlPlane.execute
		while branch.cursor:
			frame = storage.frame_at(branch.cursor)
			if frame is None:
				# Wired to a node the program doesn't have.
				execute.use(branch)
				execute.abandon()
				execute.use(None)
				return
			await self._step(branch, frame)
			# The others' turn between two nodes.
			await sleep_ms(0)

	async def _step(self, branch, frame) -> None:
		# The frame is read into the storage's one buffer: decoded (and its
		# configs copied) before the action first waits — see ExecuteCommand._run.
		execute = self.controlPlane.execute
		execute.use(branch)
		try:
			await self.controlPlane.dispatch(frame)
		finally:
			execute.use(None)

	def _stop_branches(self) -> None:
		for task in self._branches.values():
			task.cancel()
		self._branches = {}
