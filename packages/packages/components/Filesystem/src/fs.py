import os

from hio.sdk import FALLBACK


# What the Filesystem actions share — paths checked against what the board
# itself relies on, folders, and text that fits in a value.

# The most text Read publishes at once (a value is 512 B by default, and one
# frame carries all of an action's outputs) — Offset reads the rest.
CONTENT_BYTES = 384
CHUNK = 512

# What a workflow can't touch: the runtime, its entry points, the stored
# program, the components and credentials sessions install. Credentials can't
# even be read — they'd end up in the workflow's values.
_PROTECTED = ("/hio", "/components", "/secrets", "/boot.py", "/main.py", "/program.bin", "/connection.json")
_SECRET = ("/secrets",)

# Put in front of every path on the real filesystem — "" on the board; a
# temporary folder in the component's tests, run on a PC.
BASE = ""


class FsError(Exception):
	# A path the action can't use — its message is the action's `error`.
	pass


def text(value, default: str = "") -> str:
	# A string/options config arrives as bytes (its text).
	if value is None:
		return default
	if isinstance(value, (bytes, bytearray)):
		return bytes(value).decode()
	return str(value)


def _under(path: str, roots) -> bool:
	return any(path == root or path.startswith(root + "/") for root in roots)


def checked(raw, write: bool = False) -> str:
	# The path, absolute and plain ("/data//a.txt" -> "/data/a.txt") — FsError
	# when it's empty, climbs (".."), or is one the board relies on.
	path = text(raw).strip()
	if not path:
		raise FsError("no_path")
	if not path.startswith("/"):
		path = "/" + path
	parts = [part for part in path.split("/") if part and part != "."]
	if ".." in parts:
		raise FsError("denied")
	path = "/" + "/".join(parts)
	if _under(path, _SECRET) or (write and (path == "/" or _under(path, _PROTECTED))):
		raise FsError("denied")
	return path


def real(path: str) -> str:
	return BASE + path


def stat(path: str):
	# (is_folder, size) — None when nothing's there.
	try:
		info = os.stat(real(path))
	except OSError:
		return None
	return (info[0] & 0x4000) != 0, info[6]


def folders(path: str) -> None:
	# The folders `path` sits in — made when missing.
	current = ""
	for part in path.split("/")[1:-1]:
		current += "/" + part
		try:
			os.mkdir(real(current))
		except OSError:
			pass


def as_text(data: bytes) -> str:
	# Bytes as text: UTF-8 — a character cut at the end is left out — or, for
	# what isn't text, its printable bytes and "?" for the rest.
	for cut in range(4):
		try:
			return bytes(data[:len(data) - cut]).decode()
		except UnicodeError:
			continue
	return "".join(chr(b) if 32 <= b < 127 or b in (9, 10, 13) else "?" for b in data)


def fail(context, error: str, **outputs) -> str:
	# The action's Fallback: its outputs set empty, `error` saying why.
	for name, value in outputs.items():
		context.set(name, value)
	context.set("error", error)
	return FALLBACK
