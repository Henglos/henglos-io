# One packet class per command. Importing this package registers every one
# of them with PacketCodec — it's what lets PacketCodec.decode() turn a frame
# into the right packet without knowing any command itself.

from ..services.PacketCodec import PacketCodec

from .ExecutePacket import ExecutePacket
from .StandalonePacket import StandalonePacket
from .PlayPacket import PlayPacket
from .RecordPacket import RecordPacket
from .FinishRecordPacket import FinishRecordPacket
from .EraseRecordPacket import EraseRecordPacket
from .GetVersionPacket import GetVersionPacket
from .SetConnectionPacket import SetConnectionPacket
from .RemoveComponentPacket import RemoveComponentPacket
from .StreamPacket import StreamPacket
from .RunPacket import RunPacket
from .ContextSetPacket import ContextSetPacket
from .TriggerPollPacket import TriggerPollPacket

for _packet in (
	ExecutePacket,
	StandalonePacket,
	PlayPacket,
	RecordPacket,
	FinishRecordPacket,
	EraseRecordPacket,
	GetVersionPacket,
	SetConnectionPacket,
	RemoveComponentPacket,
	StreamPacket,
	RunPacket,
	ContextSetPacket,
	TriggerPollPacket,
):
	PacketCodec.register_request(_packet)

