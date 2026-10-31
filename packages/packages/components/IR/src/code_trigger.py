from hio.sdk import HIOTrigger, trigger

from .ir import number, publish, receiver, text


# IR / Code Trigger — runs its branch when a remote's code comes in: any
# code, or only the one set (Protocol, Address, Command — each empty or Any
# for any). The receiver's interrupt keeps catching codes while another
# branch runs; the newest one waiting is taken. A held button's repeats only
# count with Repeats on.
#
# Wire ids:
#   ACTION_ID  "ir/code trigger"
#   configs    "code trigger/rx pin" (pin -> UINT_8), "code trigger/protocol" (options -> text),
#              "code trigger/address", "code trigger/command" (string -> text; empty: any),
#              "code trigger/repeats" (toggle -> BOOL)
#   outputs    as Receive's: "protocol", "code" (text), "address", "command" (int), "repeat" (bool)


@trigger("ir/code trigger")
class CodeTrigger(HIOTrigger):

	def initialize(self) -> None:
		self.rx = None

	def arm(self, context) -> None:
		pin = context.get("code trigger/rx pin")
		if pin is None:
			raise ValueError("no RX Pin")
		self.protocol = text(context.get("code trigger/protocol"), "any")
		self.address = number(context.get("code trigger/address"), -1)
		self.command = number(context.get("code trigger/command"), -1)
		if self.address is None or self.command is None:
			raise ValueError("Address and Command take hex (0x45) or decimal")
		self.repeats = bool(context.get("code trigger/repeats"))
		self.rx = receiver(pin)
		# Only what comes from now on.
		self.rx.clear()

	def poll(self, context) -> bool:
		found = self.rx.code()
		if found is None:
			return False
		protocol, address, command, repeat = found
		if repeat and not self.repeats:
			return False
		if self.protocol != "any" and protocol != self.protocol:
			return False
		if self.address != -1 and address != self.address:
			return False
		if self.command != -1 and command != self.command:
			return False
		publish(context, found)
		return True
