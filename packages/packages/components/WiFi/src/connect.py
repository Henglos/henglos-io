import json
import time

from hio.sdk import HIOAction, action, sleep_ms, SUCCESS, FALLBACK

from .wlan import clamp, current_ssid, failure, ip, mac, rssi, set_hostname, station, text


# WiFi / Connect — joins the board to a network. Out once it has an
# address, Fallback when the password is wrong, the network isn't there, or
# it took longer than Timeout. Already on that network: Out at once.
#
# The network is a credential: the config carries the path of a JSON file
# the session put on the board ({"ssid": …, "password": …}) — the values
# never travel in the frame, nor sit in the workflow.
#
# Wire ids:
#   ACTION_ID  "wifi/connect"
#   configs    "connect/network" (credential -> text: its file's path),
#              "connect/timeout" (number -> FLOAT_32, ms), "connect/hostname" (string -> text)
#   outputs    "ip", "ssid", "mac", "reason" (text), "rssi" (int, dBm)
#   goes out   Success (Out) once connected, Fallback otherwise

_TIMEOUT_MS = 10000
_POLL_MS = 100
# How long a failed status must last before it's the answer: right after
# connect() the ESP32's radio may report a failure (a handshake or beacon
# timeout, even no network on its first scan) and then retry on its own and
# get on — so one bad status isn't given up on.
_FAIL_GRACE_MS = 3000


def _network(path: str):
	# (ssid, password) from the credential's file — None when it isn't there.
	try:
		with open(path) as file:
			values = json.load(file)
	except (OSError, ValueError):
		return None
	ssid = values.get("ssid") or ""
	return (ssid, values.get("password") or "") if ssid else None


def _find(wlan, ssid: str):
	# The network called `ssid` among those the radio sees — the strongest,
	# as the scan has it: (ssid as the router sends it, bssid). A name that
	# only differs by spaces around it (pasted into the credential) counts.
	# None when it isn't seen (a hidden network) or the radio refused the scan.
	try:
		found = wlan.scan()
	except OSError:
		return None
	wanted = ssid.strip()
	best = None
	for network in found:
		try:
			name = bytes(network[0]).decode()
		except UnicodeError:
			continue
		if (name == ssid or name.strip() == wanted) and (best is None or network[3] > best[3]):
			best = network
	return None if best is None else (best[0], best[1])


def _join(wlan, ssid: str, password: str) -> None:
	# Joins the network found by a scan right away, by its BSSID: the ESP32
	# otherwise may answer "no AP found" on a connect right after the radio
	# came on — even with the network right there. Not seen: by name, as is.
	key = password or None
	found = _find(wlan, ssid)
	if found is not None:
		try:
			wlan.connect(found[0], key, bssid=found[1])
			return
		except TypeError:
			pass                            # a port without bssid=: by name
	wlan.connect(ssid, key)


def _publish(context, wlan, reason: str) -> None:
	context.set("ip", ip(wlan) if wlan.isconnected() else "")
	context.set("ssid", current_ssid(wlan))
	context.set("rssi", rssi(wlan))
	context.set("mac", mac(wlan))
	context.set("reason", reason)


@action("wifi/connect")
class ConnectAction(HIOAction):

	async def execute(self, context):

		network = _network(text(context.get("connect/network"), ""))
		if network is None:
			# The credential's file isn't on the board (or isn't readable) — a
			# session of another workflow may have removed it: run this one again.
			context.set("reason", "no_credential")
			return FALLBACK
		ssid, password = network
		timeout = int(clamp(context.get("connect/timeout") or _TIMEOUT_MS, 1000, 60000))
		hostname = text(context.get("connect/hostname"), "")

		wlan = station()
		if wlan.isconnected() and current_ssid(wlan) == ssid:
			_publish(context, wlan, "")
			return SUCCESS
		# Also stops the radio retrying a last attempt on its own — it refuses
		# to scan while it does.
		try:
			wlan.disconnect()
		except OSError:
			pass

		if hostname:
			set_hostname(hostname, wlan)
		_join(wlan, ssid, password)

		deadline = time.ticks_add(time.ticks_ms(), timeout)
		reason = "timeout"
		failing_since = None
		while not wlan.isconnected():
			now = time.ticks_ms()
			failed = failure(wlan.status())
			if failed is None:
				failing_since = None
			else:
				reason = failed
				if failing_since is None:
					failing_since = now
				elif time.ticks_diff(now, failing_since) >= _FAIL_GRACE_MS:
					break
			if time.ticks_diff(deadline, now) <= 0:
				break
			await sleep_ms(_POLL_MS)

		if wlan.isconnected():
			_publish(context, wlan, "")
			return SUCCESS

		# The radio keeps retrying on its own otherwise.
		wlan.disconnect()
		_publish(context, wlan, reason)
		return FALLBACK
