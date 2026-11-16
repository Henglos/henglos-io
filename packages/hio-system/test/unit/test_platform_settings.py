# The `settings` manifest.yaml declares must stay in step with the runtime:
# every key read somewhere under hio/ with setting("KEY", default) — the
# default the manifest declares, the one the studio shows as what the board
# runs when nothing is overridden. And the overrides themselves: read from
# /hio_settings.json (hio/system/core/settings.py), whole numbers only.

import json
import pathlib
import re

from hio.system.core import settings as settings_module

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _settings():
	text = (ROOT / "manifest.yaml").read_text(encoding="utf-8")
	section = text.split("\nsettings:\n", 1)[1].split("\nrules:\n", 1)[0]
	declared = []
	for block in re.split(r"\n  - ", "\n" + section)[1:]:
		fields = dict(re.findall(r"^\s*(\w+): (.+)$", "  " + block, re.M))
		declared.append(fields)
	return declared


def _runtime_source():
	return "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "hio").rglob("*.py"))


def test_every_setting_is_read_with_its_default():
	declared = _settings()
	assert len(declared) >= 12, "manifest.yaml declares fewer settings than expected"
	source = _runtime_source()
	for setting in declared:
		key, default = setting["key"], setting["default"]
		match = re.search(r'setting\("%s",\s*(-?\d+)\)' % key, source)
		assert match, "%s isn't read with setting() under hio/" % key
		assert match.group(1) == default, "%s: manifest default %s, runtime %s" % (key, default, match.group(1))
		assert int(setting["min"]) <= int(default) <= int(setting["max"]), "%s: default outside [min, max]" % key


def test_overrides_are_read_from_the_file(tmp_path):
	path = tmp_path / "hio_settings.json"
	path.write_text(json.dumps({"MAX_VARIABLES": 32, "STREAM_TIMEOUT_MS": True, "MAX_SCRIPT_CACHE": "4"}))
	values = settings_module.load(str(path))
	assert values["MAX_VARIABLES"] == 32

	original = settings_module._values
	try:
		settings_module._values = values
		assert settings_module.setting("MAX_VARIABLES", 16) == 32
		# Not a whole number (a bool, a string): the default stays.
		assert settings_module.setting("STREAM_TIMEOUT_MS", 2000) == 2000
		assert settings_module.setting("MAX_SCRIPT_CACHE", 8) == 8
		# Not in the file at all.
		assert settings_module.setting("MAX_RECORD_SIZE", 4096) == 4096
	finally:
		settings_module._values = original


def test_no_file_or_a_broken_one_means_no_overrides(tmp_path):
	assert settings_module.load(str(tmp_path / "missing.json")) == {}
	broken = tmp_path / "broken.json"
	broken.write_text("{not json")
	assert settings_module.load(str(broken)) == {}
	listed = tmp_path / "list.json"
	listed.write_text("[1, 2]")
	assert settings_module.load(str(listed)) == {}
