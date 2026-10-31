# Builds the firmware for the board: every module under hio/ compiled to .mpy
# with mpy-cross into build/, mirroring the source tree, plus boot.py and
# main.py as plain .py — MicroPython only runs those two automatically, and
# never as .mpy. scripts/upload.py copies build/ to the board.
#
#   python scripts/build.py
#
# Needs `pip install mpy-cross`. mpy-cross must emit the .mpy version the
# board's MicroPython reads — upload.py checks it before copying.

import os
import shutil
import subprocess
import sys

import mpy_cross

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))     # packages/platform
SOURCE = "hio"
ENTRY_POINTS = ("boot.py", "main.py")
BUILD = os.path.join(ROOT, "build")

SKIP_DIRS = {"__pycache__"}


def compile_all() -> int:
	# Rebuilt from scratch: a stale .mpy of a deleted or renamed module would
	# otherwise still be copied — and still import.
	shutil.rmtree(BUILD, ignore_errors=True)

	count = 0
	failed = []

	for directory, dirs, files in os.walk(os.path.join(ROOT, SOURCE)):
		dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

		for name in files:
			if not name.endswith(".py"):
				continue

			source = os.path.join(directory, name)
			relative = os.path.relpath(source, ROOT).replace("\\", "/")      # hio/system/HIOSystem.py
			target = os.path.join(BUILD, relative[:-3] + ".mpy")
			os.makedirs(os.path.dirname(target), exist_ok=True)

			# -s: the path tracebacks show on the board, instead of the host's.
			process = mpy_cross.run("-o", target, "-s", relative, source, stderr=subprocess.PIPE)
			_, error = process.communicate()

			if process.returncode != 0:
				failed.append((relative, error.decode(errors="replace").strip()))
			else:
				count += 1

	for name in ENTRY_POINTS:
		path = os.path.join(ROOT, name)
		if os.path.exists(path):
			shutil.copy2(path, os.path.join(BUILD, name))

	for relative, error in failed:
		print("FAILED %s\n  %s" % (relative, error), file=sys.stderr)

	print("compiled %d modules into %s" % (count, os.path.relpath(BUILD, ROOT)))
	return 1 if failed else 0


if __name__ == "__main__":
	sys.exit(compile_all())
