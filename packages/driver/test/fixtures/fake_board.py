# The MicroPython side of a raw REPL, for ReplSession's tests: runs each code
# block it's sent (one JSON line in: {"code": ...}; one out: {"out", "err"})
# in one persistent namespace — so hio.tools.repl keeps its runtime between
# blocks, as on a board. The runtime is the real one (packages/hio-system, with
# hio.sdk from packages/hio-sdk — `hio` is a namespace across the two), under
# CPython with the MicroPython stubs from its tests.
#
# Every absolute path ("/hio/...") is redirected into argv[1], so uploads and
# the stored program never touch the real filesystem.

import builtins, contextlib, io, json, os, sys, traceback

SANDBOX = sys.argv[1]
PACKAGES = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "packages")
PLATFORM = os.path.join(PACKAGES, "hio-system")
SDK = os.path.join(PACKAGES, "hio-sdk", "src")
sys.path[:0] = [os.path.abspath(PLATFORM), os.path.abspath(SDK), os.path.abspath(os.path.join(PLATFORM, "test"))]

import conftest  # noqa: F401 — micropython/machine stubs

sys.implementation._mpy = 6 | (3 << 8)      # what an ESP32 on MicroPython 1.29 reports


def _remap(path):
	if isinstance(path, str) and path.startswith("/"):
		return os.path.join(SANDBOX, path.lstrip("/"))
	return path


def _wrap(function):
	return lambda path, *args, **kwargs: function(_remap(path), *args, **kwargs)


builtins.open = _wrap(builtins.open)
for name in ("stat", "listdir", "mkdir", "remove", "rmdir"):
	setattr(os, name, _wrap(getattr(os, name)))
_rename = os.rename
os.rename = lambda a, b: _rename(_remap(a), _remap(b))


# What MicroPython has and CPython doesn't, as MicroPython gives it:
# ilistdir's (name, type, inode, size), statvfs's tuple (a 1 MB filesystem,
# half free), and ubinascii.
def _ilistdir(path="/"):
	for entry in os.scandir(_remap(path)):
		yield (entry.name, 0x4000 if entry.is_dir() else 0x8000, 0, entry.stat().st_size)


os.ilistdir = _ilistdir
os.statvfs = lambda path: (4096, 4096, 256, 128, 128, 0, 0, 0, 0, 255)
import binascii  # noqa: E402
sys.modules.setdefault("ubinascii", binascii)

scope = {"__name__": "__main__"}

for line in sys.stdin:
	code = json.loads(line)["code"]
	out, err = io.StringIO(), io.StringIO()
	with contextlib.redirect_stdout(out):
		try:
			exec(code, scope)
		except BaseException:
			err.write(traceback.format_exc())
	sys.stdout.write(json.dumps({"out": out.getvalue(), "err": err.getvalue()}) + "\n")
	sys.stdout.flush()
