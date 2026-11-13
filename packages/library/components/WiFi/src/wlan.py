import network


# What the WiFi actions share — the ESP32's radio, as MicroPython's network
# module gives it: a station (the board joining a network) and an access
# point (the board being one). Both are the chip's, not this module's: a new
# session reloads the actions but the connection may still be up — so the
# actions ask the radio (isconnected(), status()) rather than keeping state.

_station = None
_access_point = None


def station():
	# The station interface, switched on.
	global _station
	if _station is None:
		_station = network.WLAN(network.STA_IF)
	if not _station.active():
		_station.active(True)
	return _station


def access_point():
	# The access point interface — not switched on here: Access Point does that.
	global _access_point
	if _access_point is None:
		_access_point = network.WLAN(network.AP_IF)
	return _access_point


# status() -> why a connection failed. The constants differ a little between
# ports and versions — read as they're there.
def _stat(name: str):
	return getattr(network, name, None)


def failure(status):
	# The reason a status means the connection failed — None while it may still come up.
	if status is None:
		return None
	if status == _stat("STAT_WRONG_PASSWORD"):
		return "wrong_password"
	if status == _stat("STAT_NO_AP_FOUND"):
		return "no_network"
	for name in ("STAT_CONNECT_FAIL", "STAT_ASSOC_FAIL", "STAT_HANDSHAKE_TIMEOUT", "STAT_BEACON_TIMEOUT"):
		if status == _stat(name):
			return "failed"
	return None


def current_ssid(wlan) -> str:
	# The network the station is on — "" when it isn't.
	if not wlan.isconnected():
		return ""
	for key in ("ssid", "essid"):
		try:
			return wlan.config(key)
		except (ValueError, OSError):
			continue
	return ""


def ip(wlan) -> str:
	return wlan.ifconfig()[0]


def rssi(wlan) -> int:
	# The signal, in dBm (-30 strong … -90 barely there) — 0 when not connected.
	try:
		return int(wlan.status("rssi"))
	except (ValueError, OSError, TypeError):
		return 0


def signal(dbm: int) -> int:
	# dBm as a percentage — -100 dBm or less is 0, -50 or more is 100.
	if dbm == 0:
		return 0
	return int(clamp(2 * (dbm + 100), 0, 100))


def mac(wlan) -> str:
	try:
		raw = wlan.config("mac")
	except (ValueError, OSError):
		return ""
	return ":".join("%02x" % b for b in raw)


def set_hostname(name: str, wlan) -> None:
	# The name the board shows on the network (MicroPython 1.20+: network.hostname).
	try:
		network.hostname(name)
	except AttributeError:
		try:
			wlan.config(dhcp_hostname=name)
		except (ValueError, OSError):
			pass


def text(value, default: str) -> str:
	# A string/options config arrives as a str.
	return str(value) if value is not None else default


def clamp(value: float, low: float, high: float) -> float:
	return low if value < low else high if value > high else value
