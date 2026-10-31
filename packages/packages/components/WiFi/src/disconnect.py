from hio.sdk import HIOAction, action, SUCCESS

from .wlan import access_point, station, text


# WiFi / Disconnect — leaves the network (Station), stops the board's own
# network (Access Point), or both; the radio goes quiet for what's stopped.
#
# Wire ids:
#   ACTION_ID  "wifi/disconnect"
#   configs    "disconnect/interface" (options -> text: "station" | "access_point" | "both")
#   goes out   Success


@action("wifi/disconnect")
class DisconnectAction(HIOAction):

	async def execute(self, context):

		interface = text(context.get("disconnect/interface"), "station")

		if interface in ("station", "both"):
			wlan = station()
			if wlan.isconnected():
				wlan.disconnect()
			wlan.active(False)
		if interface in ("access_point", "both"):
			access_point().active(False)

		return SUCCESS
