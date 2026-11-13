from hio.sdk import HIOAction, action, FALLBACK

from .ir import number, publish, text, wait_code


# IR / Match — waits for a remote's code and branches on whether it's the
# one set: Match, Other (another code came), or Timeout. "When the remote's
# OK button is pressed": Receive once to see its code, then Match on it.
#
# Wire ids:
#   ACTION_ID  "ir/match"
#   configs    "match/rx pin" (pin     -> INTEGER), "match/protocol" (options -> str: "any", "nec"…),
#              "match/address" (string -> str; empty: any), "match/command" (string -> str),
#              "match/timeout" (integer, ms), "match/repeats" (toggle -> BOOL)
#   outputs    as Receive's
#   goes out   "match" | "other" | "timeout"


@action("ir/match")
class MatchAction(HIOAction):

	async def execute(self, context):

		protocol = text(context.get("match/protocol"), "any")
		address = number(context.get("match/address"), -1)
		command = number(context.get("match/command"), None)
		if command is None or address is None:
			return FALLBACK

		found = await wait_code(context, "match")
		if found is False:
			return FALLBACK
		if found is None:
			return "timeout"
		publish(context, found)

		got_protocol, got_address, got_command, _ = found
		same = (protocol == "any" or protocol == got_protocol) \
			and (address == -1 or address == got_address) \
			and command == got_command
		return "match" if same else "other"
