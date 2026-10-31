# Uploads build/ (scripts/build.py) to the board's filesystem with mpremote.
# Assumes the board already runs MicroPython.
#
#   python scripts/upload.py                    first board mpremote finds
#   python scripts/upload.py --port COM5
#   python scripts/upload.py --build            run build.py first
#   python scripts/upload.py --no-reset         leave the board in the REPL
#
# Needs `pip install mpremote`.

import argparse
import os
import re
import subprocess
import sys

import mpy_cross

from build import BUILD, ENTRY_POINTS, SOURCE, compile_all


def mpremote(port: "str | None", *args: str, check: bool = True, capture: bool = False) -> "subprocess.CompletedProcess":
	# Runs an mpremote command on the board at `port` (the first one found when None).
	command = [sys.executable, "-m", "mpremote"]
	if port:
		command += ["connect", port]
	return subprocess.run(command + list(args), check=check, capture_output=capture, text=capture)


def local_mpy_version() -> "tuple[int, int]":
	# "MicroPython v1.29.0 on ...; mpy-cross emitting mpy v6.3"
	output = mpy_cross.run("--version", stdout=subprocess.PIPE).communicate()[0].decode()
	match = re.search(r"mpy v(\d+)\.(\d+)", output)
	if match is None:
		raise RuntimeError("can't read mpy-cross's version: %r" % output)
	return int(match.group(1)), int(match.group(2))


def board_mpy_version(port: "str | None") -> "tuple[int, int] | None":
	# sys.implementation._mpy: bits 0-7 the .mpy version, 8-9 its sub-version
	# (the rest is the native arch). Missing on a build without .mpy support.
	result = mpremote(port, "exec", "import sys; print(getattr(sys.implementation, '_mpy', -1))", capture=True)
	value = int(result.stdout.strip().splitlines()[-1])
	if value < 0:
		return None
	return value & 0xFF, (value >> 8) & 0x3


def check_versions(port: "str | None") -> bool:
	# A mismatch would only show up on the board, on the first import, as
	# "incompatible .mpy file" — caught here instead.
	local = local_mpy_version()
	board = board_mpy_version(port)

	if board is None:
		print("the board's MicroPython can't import .mpy files", file=sys.stderr)
		return False

	if board != local:
		print("mpy-cross emits mpy v%d.%d but the board reads v%d.%d — "
			"pip install the mpy-cross matching the board's MicroPython" % (local + board), file=sys.stderr)
		return False

	return True


def upload(port: "str | None", reset: bool) -> None:
	# The old tree goes first: if the board keeps foo.py next to the new
	# foo.mpy, MicroPython imports the .py.
	mpremote(port, "rm", "-r", ":" + SOURCE, check=False)      # missing on a fresh board — fine

	mpremote(port, "cp", "-r", os.path.join(BUILD, SOURCE), ":")
	for name in ENTRY_POINTS:
		path = os.path.join(BUILD, name)
		if os.path.exists(path):
			mpremote(port, "cp", path, ":" + name)

	if reset:
		mpremote(port, "reset")


def main() -> int:
	# Builds (with --build), checks the .mpy versions match, uploads, resets.
	parser = argparse.ArgumentParser(description="Upload build/ to the board with mpremote.")
	parser.add_argument("--port", help="serial port (e.g. COM5); default: first board mpremote finds")
	parser.add_argument("--build", action="store_true", help="run build.py first")
	parser.add_argument("--no-reset", action="store_true", help="don't reset the board afterwards")
	args = parser.parse_args()

	if args.build and compile_all() != 0:
		return 1

	if not os.path.isdir(os.path.join(BUILD, SOURCE)):
		print("nothing to upload — run scripts/build.py first (or pass --build)", file=sys.stderr)
		return 1

	try:
		if not check_versions(args.port):
			return 1
		upload(args.port, not args.no_reset)
	except subprocess.CalledProcessError as error:
		# mpremote already explained itself — on stderr, or captured here.
		print((error.stderr or "").strip() or "mpremote failed (exit %d)" % error.returncode, file=sys.stderr)
		return 1

	print("uploaded %s to %s" % (os.path.basename(BUILD), args.port or "the first board found"))
	return 0


if __name__ == "__main__":
	sys.exit(main())
