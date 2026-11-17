# hio/_preload.py must list every module the runtime imports, leaves
# first — or a board with a small C stack (the ESP8266) runs out of it on the
# nested imports. Regenerate it: python scripts/preload.py
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_preload_list_is_up_to_date():
	result = subprocess.run(
		[sys.executable, os.path.join(ROOT, "scripts", "preload.py"), "--check"],
		capture_output=True, text=True,
	)
	assert result.returncode == 0, result.stderr or result.stdout
