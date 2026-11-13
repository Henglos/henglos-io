from .core.interfaces.ITransport import ITransport
from .core.interfaces.IConfig import IConfig
from .core.services.CommandIngress import CommandIngress
from .core.services.ComponentLoader import ComponentLoader
from .core.services.ControlPlane import ControlPlane
from .core.services.FrameReader import FrameReader
from .core.services.ProgramStorage import ProgramStorage

from .core.tasks.MainTask import MainTask

import asyncio

class HIOSystem:
	# The runtime as a whole — what main.py builds and starts: its services,
	# wired together once, and the main task that reads frames and runs them.

	def __init__(self, transports: list[ITransport], config: IConfig) -> None:

		self.config = config
		self.transports = transports

		# Every service exists once — created here and handed to whoever needs it.
		self.__commandIngress = CommandIngress(self.transports, self.config)
		self.__frameReader = FrameReader(self.__commandIngress)
		self.__programStorage = ProgramStorage(self.config.PROGRAM_PATH)
		self.__controlPlane = ControlPlane(self.config, self.__frameReader, self.__programStorage)
		self.__componentLoader = ComponentLoader(self.config.COMPONENTS_DIR)

		self.mainTask = MainTask(self.__commandIngress, self.__frameReader, self.__controlPlane, self.__programStorage)
		self.mainHandle = None
		self.backgroundTask = None

	def initialize(self) -> None:
		# Opens the transports and loads the installed components — before start().
		# Initialize the transports
		for transport in self.transports:
			transport.begin()

		# The registry lives in RAM: installed components register again on every boot.
		self.__componentLoader.load()

	def start(self) -> None:
		# Runs the main task — forever: it doesn't return.

		# Booted on its own: a stored program plays right away — that's what
		# recording it was for. Not in initialize(): a host driving the runtime
		# (hio.tools) must not have the program running under its commands.
		if self.__programStorage.size() > 0:
			self.__controlPlane.isPlaying = True

		async def _run_all():

			self.mainHandle = asyncio.create_task(self.mainTask.run())

			await asyncio.gather(self.mainHandle)

		asyncio.run(_run_all())
