from .ITransport import ITransport


class ICommand:
	# One per COMMAND_ID, run by ControlPlane.dispatch with the decoded packet.
	# `transport` is the one the frame came in on — answer there — or None for
	# a frame of the stored program.
	#
	# `packet` is left unannotated on purpose: each command declares its own
	# packet class (ExecutePacket, SetConnectionPacket...), and narrowing an
	# IPacket here would be an incompatible override. A Generic would fix it,
	# but MicroPython has no `typing`.

	async def execute(self, packet, transport: "ITransport | None") -> None:
		raise NotImplementedError
