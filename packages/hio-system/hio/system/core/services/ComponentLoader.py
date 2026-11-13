import os
import sys


def module_name(text: str) -> str:
	# A display name as a Python module name: lowercased, anything outside
	# [a-z0-9_] as "_" — "Ultrasonic Sensor" -> "ultrasonic_sensor". The
	# platform's build names the files the same way (runner/build.ts); the
	# action's wire id still comes from the real name its @action was given.
	out = ""
	for char in text.lower():
		out += char if ("a" <= char <= "z" or "0" <= char <= "9" or char == "_") else "_"
	return out


class ComponentLoader:
	# Imports every installed component action so its @action registers it —
	# the registry lives in RAM, so this runs on every boot.
	#
	# Layout (what the driver installs when a session starts — its
	# BoardInstaller — only the actions the workflow uses):
	#   <root>/__init__.py
	#   <root>/<component>/__init__.py
	#   <root>/<component>/<action>.mpy      e.g. /components/gpio/write.mpy
	#   <root>/<component>/<module>.mpy      what the actions share, e.g. servo/driver.mpy
	# imported as "<root's name>.<component>.<action>" — "components.gpio.write"
	# (a shared module too: it registers nothing, and the actions import it anyway)
	# — with <root>'s parent on sys.path. One package around every component,
	# so none can shadow a module: a "Time" component is components.time, not
	# a top-level `time` (which MicroPython would let it override).

	def __init__(self, root: str) -> None:
		self.root = root.rstrip("/")
		cut = self.root.rfind("/")
		self._parent = self.root[:cut] or "/"
		self._package = self.root[cut + 1:]

	def path(self, name: str) -> str:
		# File of the action "<component>/<action>" (its wire name).
		component, _, action = name.partition("/")
		return "%s/%s/%s.mpy" % (self.root, module_name(component), module_name(action))

	def load(self) -> "list[str]":
		# "<component>/<action>" of every action that imported. One that fails
		# is reported and skipped — a broken component must not stop the boot.
		loaded = []

		# Not components: the package's own __init__.py, and the driver's
		# .index.json (what it installed — see its BoardInstaller).
		components = [c for c in self._list(self.root) if not c.startswith("__") and not c.startswith(".")]
		if not components:
			return loaded

		if self._parent not in sys.path:
			sys.path.append(self._parent)

		for component in components:
			for name in self._list(self.root + "/" + component):

				if name.startswith("__") or not (name.endswith(".mpy") or name.endswith(".py")):
					continue

				action = name[:name.rfind(".")]
				try:
					__import__("%s.%s.%s" % (self._package, component, action))
					loaded.append(component + "/" + action)
				except Exception as error:
					print("[components] %s/%s failed to load: %r" % (component, action, error))

		return loaded

	@staticmethod
	def _list(path: str) -> "list[str]":
		try: return sorted(os.listdir(path))
		except OSError: return []
