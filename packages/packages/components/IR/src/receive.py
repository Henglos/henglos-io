from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .ir import publish, wait_code


# IR / Receive — waits for a remote's code: its protocol, address and
# command. Goes on (Out) with it, or Fallback when nothing came in time. Noise and
# codes of protocols it doesn't know are skipped; a held button's repeats
# only count with Repeats on.
#
# Wire ids:
#   ACTION_ID  "ir/receive"
#   configs    "receive/rx pin" (pin -> UINT_8), "receive/timeout" (number -> FLOAT_32, ms),
#              "receive/repeats" (toggle -> BOOL)
#   outputs    "protocol" (text), "address", "command" (int), "code" (text: "nec 0x00 0x45"),
#              "repeat" (bool)
#   goes out   Success (Out) with a code, Fallback when none came in time


@action("ir/receive")
class ReceiveAction(HIOAction):

	async def execute(self, context):

		found = await wait_code(context, "receive")
		# False: a config that makes no sense; None: nothing came in time.
		if not found:
			return FALLBACK
		publish(context, found)
		return SUCCESS
