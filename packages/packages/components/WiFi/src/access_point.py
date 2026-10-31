from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .wlan import access_point, clamp, ip, text


# WiFi / Access Point — makes the board a network of its own, for phones and
# other boards to join: Out, with its address (usually 192.168.4.1), or
# Fallback when the password is too short (WPA2 takes 8 characters or more;
# empty is an open network).
#
# Run again with the network already up as set, it changes nothing: setting
# an access point up restarts it, dropping whoever is joining — a flow that
# loops through this action (without a pause) would never let a phone in.
#
# Wire ids:
#   ACTION_ID  "wifi/access point"
#   configs    "access point/ssid", "access point/password" (string -> text),
#              "access point/channel", "access point/max clients" (number -> FLOAT_32)
#   outputs    "ip" (text)
#   goes out   Success (Out) once it's up, Fallback otherwise

_AUTH_OPEN = 0
_AUTH_WPA2_PSK = 3

# What this session last set the access point up with — the password can't be
# read back from the radio, so it's compared here.
_applied = None


@action("wifi/access point")
class AccessPointAction(HIOAction):

	async def execute(self, context):
		global _applied

		ssid = text(context.get("access point/ssid"), "")
		if not ssid:
			return FALLBACK
		password = text(context.get("access point/password"), "")
		if password and len(password) < 8:
			context.set("ip", "")
			return FALLBACK
		channel = int(clamp(context.get("access point/channel") or 1, 1, 13))
		clients = int(clamp(context.get("access point/max clients") or 4, 1, 10))

		ap = access_point()
		wanted = (ssid, password, channel, clients)
		if ap.active() and _applied == wanted:
			context.set("ip", ip(ap))
			return SUCCESS

		ap.active(True)
		options = {"essid": ssid, "channel": channel, "authmode": _AUTH_WPA2_PSK if password else _AUTH_OPEN}
		if password:
			options["password"] = password
		try:
			ap.config(**options)
			try:
				ap.config(max_clients=clients)
			except (ValueError, OSError):
				pass                    # a port without the setting
		except (ValueError, OSError):
			ap.active(False)
			_applied = None
			context.set("ip", "")
			return FALLBACK

		_applied = wanted
		context.set("ip", ip(ap))
		return SUCCESS
