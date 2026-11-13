from ..interfaces.IConfig import IConfig
from ..interfaces.ICommand import ICommand

from .CommandIngress import TransportChannel
from .FrameReader import FrameReader, FrameLease
from .ProgramStorage import ProgramStorage
from .PacketCodec import PacketCodec, Frame, CommandId
from ..packets.ExecutePacket import ExecutePacket
from ..packets.RunPacket import RunPacket

from ..commands.ExecuteCommand import ExecuteCommand
from ..commands.RecordCommand import RecordCommand
from ..commands.FinishRecordCommand import FinishRecordCommand
from ..commands.EraseRecordCommand import EraseRecordCommand
from ..commands.StandaloneCommand import StandaloneCommand
from ..commands.PlayCommand import PlayCommand
from ..commands.GetVersionCommand import GetVersionCommand
from ..commands.SetConnectionCommand import SetConnectionCommand
from ..commands.RemoveComponentCommand import RemoveComponentCommand
from ..commands.StreamCommand import StreamCommand
from ..commands.ContextSetCommand import ContextSetCommand
from ..commands.TriggerPollCommand import TriggerPollCommand


# Routes every decoded packet to its command. The only state kept here is what
# routing needs — the commands flip it themselves:
#   isRecording: an EXECUTE is archived (RecordCommand) instead of run.
#   isPlaying:   MainTask feeds the stored program's frames in.
class ControlPlane:

	def __init__(self, config: IConfig, reader: FrameReader, programStorage: ProgramStorage) -> None:

		self.isRecording = False
		self.isPlaying = False

		self.execute = ExecuteCommand(config, reader)
		self.record = RecordCommand(self, config, programStorage)

		# EXECUTE isn't here: dispatch() routes it, see below.
		self._commands: dict[int, ICommand] = {
			CommandId.RECORD: self.record,
			CommandId.STANDALONE: StandaloneCommand(self, programStorage),
			CommandId.PLAY: PlayCommand(),
			CommandId.FINISH_RECORD: FinishRecordCommand(self, self.execute),
			CommandId.ERASE_RECORD: EraseRecordCommand(self, programStorage),
			CommandId.GET_VERSION: GetVersionCommand(config),
			CommandId.SET_CONNECTION: SetConnectionCommand(config),
			CommandId.REMOVE_COMPONENT: RemoveComponentCommand(config, self.execute),
			CommandId.STREAM: StreamCommand(),
			CommandId.CONTEXT_SET: ContextSetCommand(self.execute),
			CommandId.TRIGGER_POLL: TriggerPollCommand(self.execute),
		}

	# `frame` points into a buffer (the channel's, or ProgramStorage's) and is
	# only valid until this returns — copy anything that must outlive it.
	#
	# `channel`/`lease`: where the frame came in and its bytes there. None for
	# a frame of the stored program — no one to answer, and no channel an
	# action could read STREAM chunks from.
	async def dispatch(self, frame: Frame, channel: "TransportChannel | None" = None, lease: "FrameLease | None" = None) -> None:

		packet = PacketCodec.decode(frame)
		if packet is None: return

		transport = channel.transport if channel is not None else None

		# RUN: one action on its own — runs even while recording (it's not
		# part of the program), and never moves the flow.
		if isinstance(packet, RunPacket):
			await self.execute.run(packet, transport, channel, lease)
			return

		# isinstance, not COMMAND_ID: it's what narrows `packet` to ExecutePacket.
		if isinstance(packet, ExecutePacket):
			if self.isRecording:
				await self.record.execute(packet, transport)
			else:
				await self.execute.execute(packet, transport, channel, lease)
			return

		command = self._commands.get(packet.COMMAND_ID)
		if command is not None:
			await command.execute(packet, transport)
