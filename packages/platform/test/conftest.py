# Runs the MicroPython runtime under CPython: stubs the MicroPython-only
# modules it imports and puts packages/platform on sys.path so tests import
# it as `hio` — the same package the board runs.

import os
import sys
import types

_TEST = os.path.dirname(os.path.abspath(__file__))
_PLATFORM = os.path.dirname(_TEST)
for _path in (_PLATFORM, _TEST):                   # `hio`, and the tests' own `support`
	if _path not in sys.path:
		sys.path.insert(0, _path)

if "micropython" not in sys.modules:
	micropython = types.ModuleType("micropython")
	micropython.const = lambda value: value
	sys.modules["micropython"] = micropython

if "machine" not in sys.modules:
	machine = types.ModuleType("machine")

	class UART:                                     # never opened by the tests
		def __init__(self, *args, **kwargs) -> None:
			raise RuntimeError("machine.UART is not available under tests")

	class Pin:
		# Simulated GPIO: `levels` is the board, by pin number. An output
		# drives its level there; an input reads whatever the test put there
		# (0 when nothing did). `modes` records the last mode set per pin.
		IN = 1
		OUT = 3
		PULL_UP = 2
		PULL_DOWN = 1
		IRQ_RISING = 1
		IRQ_FALLING = 2

		levels = {}
		modes = {}
		pulls = {}
		# An input's interrupt, by pin number: (handler, trigger). A test
		# fires it with Pin.edge(id).
		irqs = {}

		def __init__(self, id: int, mode: int = -1, pull: int = -1) -> None:
			self.id = id
			if mode != -1:
				Pin.modes[id] = mode
			if pull != -1:
				Pin.pulls[id] = pull

		def irq(self, handler=None, trigger: int = 3, hard: bool = False) -> None:
			if handler is None:
				Pin.irqs.pop(self.id, None)
			else:
				Pin.irqs[self.id] = (handler, trigger)

		@staticmethod
		def edge(id: int, level: int) -> None:
			# The pin goes to `level` — its interrupt runs, when one is set.
			Pin.levels[id] = level
			irq = Pin.irqs.get(id)
			if irq is not None:
				irq[0](Pin(id))

		def value(self, value=None):
			if value is None:
				return Pin.levels.get(self.id, 0)
			Pin.levels[self.id] = 1 if value else 0

		@staticmethod
		def reset() -> None:
			Pin.levels.clear()
			Pin.modes.clear()
			Pin.pulls.clear()
			Pin.irqs.clear()

	class PWM:
		# Simulated PWM, the ESP32 port's API: `signals` is the board, by pin
		# number — {"freq", "duty_ns"} while a signal is out, gone once
		# deinit() stops it. Like the real port, a second PWM on a pin that
		# already has one fails.
		signals = {}

		def __init__(self, pin: "Pin", freq: int = 0, duty_ns: int = 0, duty_u16: int = 0) -> None:
			if pin.id in PWM.signals:
				raise RuntimeError("PWM is inactive")
			self.id = pin.id
			period_ns = 1_000_000_000 // freq if freq else 0
			PWM.signals[self.id] = {"freq": freq, "duty_ns": duty_ns or period_ns * duty_u16 // 65535}

		def freq(self, value=None):
			if value is None:
				return PWM.signals[self.id]["freq"]
			PWM.signals[self.id]["freq"] = value

		def duty_ns(self, value=None):
			if value is None:
				return PWM.signals[self.id]["duty_ns"]
			PWM.signals[self.id]["duty_ns"] = value

		def deinit(self) -> None:
			PWM.signals.pop(self.id, None)

		@staticmethod
		def reset() -> None:
			PWM.signals.clear()

	machine.UART = UART
	machine.Pin = Pin
	machine.PWM = PWM
	machine.reset = lambda: None
	sys.modules["machine"] = machine
