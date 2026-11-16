# The workflow's overrides of the runtime's limits — the platform manifest's
# `settings` — read once, when the runtime is imported, from SETTINGS_PATH on the
# board. The driver writes that file before a session (BoardInstaller), with the
# values the hosting checked; the stored program reads the same file at boot.
#
# Not compiled in: the same firmware serves every workflow, and changing a limit
# only rewrites this file. A key that's missing — or isn't a whole number — keeps
# the default its module passes to setting().

import json

SETTINGS_PATH = "/hio_settings.json"


def load(path: str) -> dict:
	# The overrides in `path`: {} when there's no file, or it isn't a JSON object.
	try:
		with open(path) as f:
			values = json.load(f)
	except Exception:
		return {}
	return values if isinstance(values, dict) else {}


_values = load(SETTINGS_PATH)


def setting(key: str, default: int) -> int:
	# `key`'s override, or `default`. bool is an int in Python: excluded.
	value = _values.get(key)
	return value if type(value) is int else default
