# ComponentLoader against a temp components folder laid out the way the
# platform's build produces it: <root>/__init__.py, <root>/<component>/__init__.py
# + <action>.py — imported as "<root>.<component>.<action>".

import sys

import pytest

from hio.sdk.core import registry
from hio.sdk.core.identifier import generate_id
from hio.system.core.services.ComponentLoader import ComponentLoader

_ACTION = """
from hio.sdk import HIOAction, action

@action("%s")
class Action(HIOAction):
	async def execute(self, context):
		return None
"""

_PACKAGE = "hio_test_components"


@pytest.fixture
def root(tmp_path):
	folder = tmp_path / _PACKAGE
	folder.mkdir()
	(folder / "__init__.py").write_text("")
	yield folder
	# Leave nothing behind for other tests: the path, the modules, the actions.
	parent = str(tmp_path).replace("\\", "/")
	if parent in sys.path:
		sys.path.remove(parent)
	for name in [n for n in sys.modules if n == _PACKAGE or n.startswith(_PACKAGE + ".")]:
		del sys.modules[name]
	for name in ("loadertest/write", "loadertest/read", "loadertestbroken/boom", "time/delay"):
		registry.unregister(generate_id(name))


def _component(root, name: str, actions: dict) -> None:
	folder = root / name
	folder.mkdir()
	(folder / "__init__.py").write_text("")
	for action, source in actions.items():
		(folder / (action + ".py")).write_text(source)


def _loader(root) -> ComponentLoader:
	return ComponentLoader(str(root).replace("\\", "/"))


def test_registers_every_action(root):
	_component(root, "loadertest", {
		"write": _ACTION % "loadertest/write",
		"read": _ACTION % "loadertest/read",
	})

	assert _loader(root).load() == ["loadertest/read", "loadertest/write"]
	assert registry.find(generate_id("loadertest/write")) is not None
	assert registry.find(generate_id("loadertest/read")) is not None


def test_a_component_named_like_a_module_doesnt_shadow_it(root):
	# A "Time" component lands at <root>/time — it must import as
	# <root>.time, leaving the real `time` module alone.
	import time
	_component(root, "time", {"delay": _ACTION % "time/delay"})

	assert _loader(root).load() == ["time/delay"]
	assert registry.find(generate_id("time/delay")) is not None
	assert sys.modules["time"] is time
	assert (_PACKAGE + ".time.delay") in sys.modules


def test_actions_share_a_module_of_their_component(root):
	# servo/driver.py, imported by the actions as `from .driver import ...` —
	# one module, so they all see the same state.
	_component(root, "loadertest", {
		"driver": "pins = {}\n",
		"write": "from .driver import pins\npins['write'] = 1\n" + _ACTION % "loadertest/write",
		"read": "from .driver import pins\npins['read'] = 1\n" + _ACTION % "loadertest/read",
	})

	assert _loader(root).load() == ["loadertest/driver", "loadertest/read", "loadertest/write"]
	assert sys.modules[_PACKAGE + ".loadertest.driver"].pins == {"read": 1, "write": 1}


def test_a_broken_action_is_skipped(root, capsys):
	_component(root, "loadertest", {"write": _ACTION % "loadertest/write"})
	_component(root, "loadertestbroken", {"boom": "raise RuntimeError('nope')"})

	assert _loader(root).load() == ["loadertest/write"]
	assert "loadertestbroken/boom failed" in capsys.readouterr().out


def test_the_drivers_index_is_not_a_component(root):
	# The driver's BoardInstaller keeps <root>/.index.json (what it installed).
	(root / ".index.json").write_text('{"/components/loadertest/write.mpy": "abc"}')
	_component(root, "loadertest", {"write": _ACTION % "loadertest/write"})

	assert _loader(root).load() == ["loadertest/write"]


def test_missing_folder_loads_nothing(tmp_path):
	assert ComponentLoader(str(tmp_path / "nope")).load() == []


def test_path_of_an_action():
	assert ComponentLoader("/components").path("Ultrasonic Sensor/Read Distance") == "/components/ultrasonic_sensor/read_distance.mpy"
