# The board's options with `scope: runtime` (its manifest's `options`): the
# workflow's values, or the defaults — sent with the session, so changing one
# needs no build. The driver writes them to /hio_settings.json, under "options";
# they're read once, when the sdk is imported (a change reloads it).
#
#   from henglosio.sdk import board_option
#   led = board_option("STATUS_LED", 2)

import json

SETTINGS_PATH = "/hio_settings.json"


def load(path: str) -> dict:
	# The "options" in `path`: {} when there's no file, or no such object in it.
	try:
		with open(path) as f:
			values = json.load(f)
	except Exception:
		return {}
	options = values.get("options") if isinstance(values, dict) else None
	return options if isinstance(options, dict) else {}


_options = load(SETTINGS_PATH)


def board_option(key: str, default=None):
	# `key`'s value (a str, int or bool, as the manifest declares it), or `default`.
	return _options.get(key, default)
