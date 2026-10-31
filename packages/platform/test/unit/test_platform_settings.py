# The `settings` manifest.yaml declares must stay in step with the runtime:
# every key assigned in its file (under hio/, SystemConfig.py by default) with
# the default written there — the build rewrites those lines
# (runner/build.ts applySettings), and the studio shows `default` as what the
# board runs when nothing is overridden.

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _settings():
	text = (ROOT / "manifest.yaml").read_text(encoding="utf-8")
	section = text.split("\nsettings:\n", 1)[1].split("\nrules:\n", 1)[0]
	settings = []
	for block in re.split(r"\n  - ", "\n" + section)[1:]:
		fields = dict(re.findall(r"^\s*(\w+): (.+)$", "  " + block, re.M))
		settings.append(fields)
	return settings


def test_every_setting_is_assigned_with_its_default_in_its_file():
	settings = _settings()
	assert len(settings) >= 12, "manifest.yaml declares fewer settings than expected"
	for setting in settings:
		key, default = setting["key"], setting["default"]
		file = setting.get("file", "system/SystemConfig.py")
		source = (ROOT / "hio" / file).read_text(encoding="utf-8")
		match = re.search(r"^\s*%s\s*=\s*(?:const\((-?\d+)\)|(-?\d+))" % key, source, re.M)
		assert match, "%s isn't assigned a number in hio/%s" % (key, file)
		assert (match.group(1) or match.group(2)) == default, "%s: manifest default %s, hio/%s %s" % (key, default, file, match.group(1) or match.group(2))
		assert int(setting["min"]) <= int(default) <= int(setting["max"]), "%s: default outside [min, max]" % key
