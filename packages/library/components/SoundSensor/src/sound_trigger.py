from machine import Pin

from hio.sdk import HIOTrigger, trigger, ticks_ms, ticks_diff

from .sound import active_level, level, number, peak_to_peak


# Sound Sensor / Sound Trigger — runs its branch on a sound: a clap, a knock,
# a dog barking. Then it waits Cooldown before it can fire again, so one sound
# (and its echo) is one run.
#
# With a Digital Pin, the module's DO: its edge is caught by an interrupt —
# instant, nothing missed between two polls (the interrupt only notes it; the
# branch runs from the main loop). Without one, Analog Pin: a short Window
# read every Interval, fired when level passes Threshold.
#
# Wire ids:
#   ACTION_ID  "sound sensor/sound trigger"
#   configs    "sound trigger/digital pin", "sound trigger/analog pin" (pin     -> INTEGER),
#              "sound trigger/active" (options -> str), "sound trigger/threshold",
#              "sound trigger/cooldown", "sound trigger/window", "sound trigger/interval",
#              "sound trigger/full scale" (number)
#   outputs    "level" (float — analog), "loud" (bool), "at" (int — ticks_ms of the sound)


@trigger("sound sensor/sound trigger")
class SoundTrigger(HIOTrigger):

	def initialize(self) -> None:
		self.pin = None
		self.pending = False
		self.at = 0

	def arm(self, context) -> None:
		digital = context.get("sound trigger/digital pin")
		self.analog = context.get("sound trigger/analog pin")
		if digital is None and self.analog is None:
			raise ValueError("no Digital Pin nor Analog Pin")
		self.cooldown = int(number(context.get("sound trigger/cooldown"), 300))
		self.threshold = number(context.get("sound trigger/threshold"), 30)
		self.window = max(1, int(number(context.get("sound trigger/window"), 20)))
		self.interval = max(10, int(number(context.get("sound trigger/interval"), 100)))
		self.full_scale = number(context.get("sound trigger/full scale"), 16384)
		self.fired = None               # when it last fired
		self.read = None                # when Analog Pin was last read
		self.pending = False

		if digital is not None:
			active = active_level(context.get("sound trigger/active"))
			self.pin = Pin(int(digital), Pin.IN)
			edge = getattr(Pin, "IRQ_RISING", 1) if active else getattr(Pin, "IRQ_FALLING", 2)
			self.pin.irq(handler=self._edge, trigger=edge)

	def _edge(self, pin) -> None:
		# In the interrupt: just note it — no allocation, no flow.
		if not self.pending:
			self.at = ticks_ms()
			self.pending = True

	def _cooling(self, now) -> bool:
		return self.fired is not None and ticks_diff(now, self.fired) < self.cooldown

	def poll(self, context) -> bool:
		now = ticks_ms()

		if self.pin is not None:
			if not self.pending:
				return False
			self.pending = False
			if self._cooling(self.at):
				return False            # the same sound (its echo) — or one inside Cooldown
			self.fired = self.at
			context.set("loud", True)
			context.set("at", self.at)
			return True

		# Analog: a Window every Interval (the read blocks for Window — keep it short).
		if self._cooling(now) or (self.read is not None and ticks_diff(now, self.read) < self.interval):
			return False
		self.read = now
		percent = level(peak_to_peak(self.analog, self.window), self.full_scale)
		if percent < self.threshold:
			return False
		self.fired = now
		context.set("level", percent)
		context.set("loud", True)
		context.set("at", now)
		return True

	def disarm(self) -> None:
		if self.pin is not None:
			self.pin.irq(handler=None)
			self.pin = None
