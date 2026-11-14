from henglosio.sdk import HIOAction, action

from .wlan import access_point, current_ssid, ip, rssi, signal, station


# WiFi / Status — branches on whether the board is on a network: Connected
# or Disconnected. Also says how the access point is doing, if it's on.
#
# Wire ids:
#   ACTION_ID  "wifi/status"
#   outputs    "ip", "ssid" (text), "rssi" (int, dBm), "signal" (int, %),
#              "ap_active" (bool), "ap_clients" (int)
#   goes out   "connected" | "disconnected"


def _clients(ap) -> int:
	try:
		return len(ap.status("stations"))
	except (ValueError, OSError, TypeError):
		return 0


@action("wifi/status")
class StatusAction(HIOAction):

	async def execute(self, context):

		wlan = station()
		connected = wlan.isconnected()
		strength = rssi(wlan) if connected else 0

		context.set("ip", ip(wlan) if connected else "")
		context.set("ssid", current_ssid(wlan))
		context.set("rssi", strength)
		context.set("signal", signal(strength))

		ap = access_point()
		active = bool(ap.active())
		context.set("ap_active", active)
		context.set("ap_clients", _clients(ap) if active else 0)

		return "connected" if connected else "disconnected"
