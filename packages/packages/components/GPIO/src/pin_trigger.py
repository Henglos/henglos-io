from machine import Pin

from hio.sdk import HIOTrigger, trigger, ticks_ms, ticks_diff


# GPIO / Pin Trigger — runs its branch on an edge of a pin: a button pressed,
# a sensor going high. The interrupt only notes that an edge came (and when)
# — the branch runs from the main loop, never inside the interrupt. Edges
# closer than Debounce to the last one are a bounce, ignored. While a branch
# runs, one more edge waits; more than that are the same press.
#
# Wire ids:
#   ACTION_ID  "gpio/pin trigger"
#   configs    "pin trigger/pin" (pin -> UINT_8), "pin trigger/edge" (options -> text:
#              rising, falling, both), "pin trigger/pull" (options -> text: none, up, down),
#              "pin trigger/debounce" (number -> FLOAT_32, ms)
#   outputs    "level" (bool — the pin after the edge), "at" (int — ticks_ms of the edge)

_DEFAULT_DEBOUNCE_MS = 50


def _text(value, default: str) -> str:
	return bytes(value).decode() if isinstance(value, (bytes, bytearray)) else default


@trigger("gpio/pin trigger")
class PinTrigger(HIOTrigger):

	def initialize(self) -> None:
		self._pin = None
		self._pending = False
		self._at = 0
		self._last = 0

	def arm(self, context) -> None:
		gpio = context.get("pin trigger/pin")
		if gpio is None:
			raise ValueError("no Pin")
		edge = _text(context.get("pin trigger/edge"), "rising")
		pull = _text(context.get("pin trigger/pull"), "none")
		debounce = context.get("pin trigger/debounce")
		self._debounce = int(debounce) if isinstance(debounce, (int, float)) else _DEFAULT_DEBOUNCE_MS

		pulls = {"up": getattr(Pin, "PULL_UP", None), "down": getattr(Pin, "PULL_DOWN", None)}
		rising, falling = getattr(Pin, "IRQ_RISING", 1), getattr(Pin, "IRQ_FALLING", 2)
		edges = {"rising": rising, "falling": falling, "both": rising | falling}

		self._pin = Pin(int(gpio), Pin.IN, pulls.get(pull)) if pulls.get(pull) is not None else Pin(int(gpio), Pin.IN)
		self._pending = False
		self._last = ticks_ms()
		self._pin.irq(handler=self._edge, trigger=edges.get(edge, rising))

	def _edge(self, pin) -> None:
		# In the interrupt: just note it — no allocation, no flow.
		now = ticks_ms()
		if ticks_diff(now, self._last) < self._debounce:
			return
		self._last = now
		self._at = now
		self._pending = True

	def poll(self, context) -> bool:
		if not self._pending:
			return False
		self._pending = False
		context.set("level", self._pin.value() != 0)
		context.set("at", self._at)
		return True

	def disarm(self) -> None:
		if self._pin is not None:
			self._pin.irq(handler=None)
			self._pin = None
