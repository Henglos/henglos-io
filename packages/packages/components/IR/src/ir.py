import time
from array import array

from machine import Pin, PWM
from hio.sdk import sleep_ms

from .protocols import PROTOCOLS, decode


# What the IR actions share — an IR LED to send with, a receiver module to
# listen with (VS1838B, TSOP38238 and the like: 3 pins, output low while it
# sees the 38 kHz carrier).
#
# Receiving: an interrupt notes when each edge came (nothing else — it can't
# allocate), and once the line has been quiet for a moment the gaps between
# edges are the frame's timings, decoded by protocols.py.
#
# Sending: the ESP32's RMT makes the carrier and the timings in hardware —
# exact; where it isn't there, PWM for the carrier, switched on and off in
# time by the CPU.

CARRIER_HZ = 38000
# A frame is over once the line has been quiet this long (the longest gap
# inside one is 4.5 ms).
_FRAME_GAP_US = 10000
# Edges kept per frame — a 32-bit frame has 68.
_MAX_EDGES = 200


class Receiver:

	def __init__(self, pin: int) -> None:
		self._edges = array("i", [0] * _MAX_EDGES)
		self._count = array("i", [0])
		self._pin = Pin(pin, Pin.IN)
		# The last code decoded — what a held button's repeat frames repeat.
		self.last = None
		edges, count = self._edges, self._count

		def edge(_pin):
			n = count[0]
			if n < _MAX_EDGES:
				edges[n] = time.ticks_us()
				count[0] = n + 1

		try:
			self._pin.irq(edge, Pin.IRQ_FALLING | Pin.IRQ_RISING, hard=True)
		except TypeError:
			self._pin.irq(edge, Pin.IRQ_FALLING | Pin.IRQ_RISING)

	def clear(self) -> None:
		self._count[0] = 0

	def frame(self):
		# The timings of a frame that's over — None while there's none yet (or
		# one is still coming in). Its edges are used up either way.
		n = self._count[0]
		if n < 2 or time.ticks_diff(time.ticks_us(), self._edges[n - 1]) < _FRAME_GAP_US:
			return None
		timings = [time.ticks_diff(self._edges[i + 1], self._edges[i]) for i in range(n - 1)]
		self.clear()
		return timings

	def code(self):
		# (protocol, address, command, repeat) of a frame that came in — a
		# held button's repeat gives the last code again, marked repeat. None
		# while nothing (or only noise) came.
		timings = self.frame()
		if timings is None:
			return None
		# A frame may come after a glitch, or be caught midway (starting on a
		# space): tried from each of its first timings.
		for start in range(min(len(timings), 8)):
			found = decode(timings[start:])
			if found is None:
				continue
			protocol, address, command, repeat = found
			if repeat:
				if self.last is None or self.last[0] != protocol:
					return None
				return self.last[:3] + (True,)
			self.last = found
			return found
		return None


_receivers = {}             # pin -> Receiver


def receiver(pin: int) -> Receiver:
	found = _receivers.get(pin)
	if found is None:
		found = _receivers[pin] = Receiver(pin)
	return found


class Transmitter:

	def __init__(self, pin: int, carrier: int) -> None:
		self.carrier = carrier
		self._rmt = _rmt(pin, carrier)
		self._pwm = None
		if self._rmt is None:
			self._pwm = PWM(Pin(pin), freq=carrier, duty_u16=0)

	def send(self, timings) -> None:
		# The marks and spaces, as the light goes — returns once they're out.
		if self._rmt is not None:
			self._rmt.write_pulses(tuple(timings), True)
			try:
				self._rmt.wait_done(timeout=200)
			except TypeError:
				self._rmt.wait_done()
			return
		# The carrier on for a mark, off for a space — timed against the clock,
		# not slept, so the errors don't add up.
		lit = 65535 // 3
		at = time.ticks_us()
		for i, duration in enumerate(timings):
			self._pwm.duty_u16(lit if i % 2 == 0 else 0)
			at = time.ticks_add(at, duration)
			while time.ticks_diff(at, time.ticks_us()) > 0:
				pass
		self._pwm.duty_u16(0)


def _rmt(pin: int, carrier: int):
	# The ESP32's RMT at 1 µs a tick, with the carrier — its arguments changed
	# between MicroPython versions, both are tried. None where there's no RMT.
	try:
		import esp32
	except ImportError:
		return None
	for options in ({"clock_div": 80}, {"resolution_hz": 1_000_000}):
		try:
			return esp32.RMT(0, pin=Pin(pin), tx_carrier=(carrier, 33, 1), **options)
		except (TypeError, ValueError):
			continue
		except OSError:
			return None
	return None


_transmitters = {}          # (pin, carrier) -> Transmitter


def transmitter(pin: int, carrier: int) -> Transmitter:
	key = (pin, carrier)
	found = _transmitters.get(key)
	if found is None:
		# One RMT channel: another pin or carrier gives the old one up first.
		for other_key, other in list(_transmitters.items()):
			if other._rmt is not None:
				try:
					other._rmt.deinit()
				except AttributeError:
					pass
			del _transmitters[other_key]
		found = _transmitters[key] = Transmitter(pin, carrier)
	return found


def frames(protocol: str, address: int, command: int, repeats: int):
	# What sending a code takes: the frame, then `repeats` more as a held
	# button sends them — with the period each starts on, in ms.
	encode, _, period, repeat = PROTOCOLS[protocol]
	first = encode(address, command)
	again = repeat() if repeat is not None else first
	return [first] + [again] * repeats, period


_TIMEOUT_MS = 1000
_POLL_MS = 10


async def wait_code(context, action: str):
	# The next code on the action's receiver — None when the time ran out, or
	# False when its pin isn't set. A held button's repeats only with Repeats on.
	pin = context.get(action + "/rx pin")
	if pin is None:
		return False
	timeout = int(clamp(context.get(action + "/timeout") or _TIMEOUT_MS, 10, 60000))
	repeats = bool(context.get(action + "/repeats"))

	rx = receiver(pin)
	# Only what comes from now on — not a press from before the action ran.
	rx.clear()
	deadline = time.ticks_add(time.ticks_ms(), timeout)
	while True:
		found = rx.code()
		if found is not None and (repeats or not found[3]):
			return found
		if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
			return None
		await sleep_ms(_POLL_MS)


def publish(context, found) -> None:
	# A code's outputs — Receive's and Match's.
	protocol, address, command, repeat = found
	context.set("protocol", protocol)
	context.set("address", address)
	context.set("command", command)
	context.set("code", "%s %s %s" % (protocol, hex_code(address, 4 if address > 0xFF else 2), hex_code(command)))
	context.set("repeat", repeat)


def number(value, default):
	# A code's address or command: typed ("0x45", "69") or bound (a number).
	if value is None:
		return default
	if isinstance(value, (int, float)):
		return int(value)
	text = bytes(value).decode().strip().lower()
	if not text:
		return default
	try:
		return int(text, 16) if text.startswith("0x") else int(text)
	except ValueError:
		return None


def text(value, default: str) -> str:
	# A string/options config arrives as bytes (its text).
	return bytes(value).decode() if value is not None else default


def clamp(value: float, low: float, high: float) -> float:
	return low if value < low else high if value > high else value


def hex_code(value: int, digits: int = 2) -> str:
	return "0x" + ("%0" + str(digits) + "X") % value
