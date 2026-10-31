import time

from hio.sdk import HIOAction, action, sleep_ms, SUCCESS, FALLBACK

from .ir import CARRIER_HZ, clamp, frames, number, text, transmitter
from .protocols import PROTOCOLS


# IR / Send — sends a remote's code from an IR LED: its protocol, address
# and command, once or as a held button (Repeats more, a frame period apart).
#
# Wire ids:
#   ACTION_ID  "ir/send"
#   configs    "send/tx pin" (pin -> UINT_8), "send/protocol" (options -> text),
#              "send/address", "send/command" (string -> text: "0x45" or "69";
#                                              or a bound number),
#              "send/repeats" (number -> FLOAT_32), "send/carrier" (number -> FLOAT_32, kHz)
#   goes out   Success, or Fallback for a code that doesn't make sense


@action("ir/send")
class SendAction(HIOAction):

	async def execute(self, context):

		pin = context.get("send/tx pin")
		protocol = text(context.get("send/protocol"), "nec")
		address = number(context.get("send/address"), 0)
		command = number(context.get("send/command"), None)
		if pin is None or protocol not in PROTOCOLS or address is None or command is None:
			return FALLBACK
		if not 0 <= address <= 0xFFFF or not 0 <= command <= 0xFF:
			return FALLBACK

		repeats = int(clamp(context.get("send/repeats") or 0, 0, 50))
		carrier = int(clamp(context.get("send/carrier") or CARRIER_HZ / 1000, 30, 60) * 1000)

		led = transmitter(pin, carrier)
		codes, period = frames(protocol, address, command, repeats)
		for i, timings in enumerate(codes):
			started = time.ticks_ms()
			led.send(timings)
			if i < len(codes) - 1:
				# The next one starts a period after this one did.
				await sleep_ms(max(0, period - time.ticks_diff(time.ticks_ms(), started)))

		return SUCCESS
