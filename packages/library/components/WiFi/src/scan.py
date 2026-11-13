import json

from hio.sdk import HIOAction, action, sleep_ms, SUCCESS

from .wlan import station


# WiFi / Scan — looks at the networks around and publishes them, strongest
# first; always goes on through Out (an empty list when the radio refused).
#
# Wire ids:
#   ACTION_ID  "wifi/scan"
#   outputs    "networks" (list of { ssid, rssi, channel } — the strongest, as many as fit)

# Networks listed — at most this many, and only as many as fit a value as JSON
# (the board's 512 B).
_MAX_LISTED = 10
_MAX_LIST_BYTES = 480


def _name(raw) -> str:
	# An SSID as text — one that isn't UTF-8 (some routers) keeps its readable
	# characters, the rest as "?", instead of failing the whole scan.
	if not isinstance(raw, (bytes, bytearray)):
		return raw
	try:
		return bytes(raw).decode()
	except UnicodeError:
		return "".join(chr(b) if 32 <= b < 127 else "?" for b in raw)


def _scan():
	# The networks around, strongest first — None when the radio refused (it
	# does while it's still busy joining a network).
	try:
		found = station().scan()
	except OSError:
		return None
	return sorted(found, key=lambda network: network[3], reverse=True)


def _listed(networks):
	# The strongest networks as { ssid, rssi, channel }, as many as fit.
	listed = []
	for network in networks[:_MAX_LISTED]:
		entry = {"ssid": _name(network[0]), "rssi": network[3], "channel": network[2]}
		if len(json.dumps(listed + [entry])) > _MAX_LIST_BYTES:
			break
		listed.append(entry)
	return listed


@action("wifi/scan")
class ScanAction(HIOAction):

	async def execute(self, context):

		networks = _scan()
		if networks is None:
			# Tried once more a moment later.
			await sleep_ms(500)
			networks = _scan()

		# Still refused: no networks seen — an empty list, the flow goes on.
		context.set("networks", _listed(networks or []))
		return SUCCESS
