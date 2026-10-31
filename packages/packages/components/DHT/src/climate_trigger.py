from hio.sdk import HIOTrigger, trigger, ticks_ms, ticks_diff

from .sensor import measure, min_interval, model_of, publish, text, to_unit


# DHT / Climate Trigger — runs its branch when the temperature or the
# humidity goes above (or below) Limit, read every Interval. Once it fired,
# it fires again only after the value came back past Hysteresis — so a value
# sitting right on Limit doesn't fire over and over. Past Limit already when
# it's armed counts as getting there.
#
# Wire ids:
#   ACTION_ID  "dht/climate trigger"
#   configs    "climate trigger/data pin" (pin), "climate trigger/model", "climate trigger/unit",
#              "climate trigger/watch" (temperature | humidity), "climate trigger/when" (above | below)
#              (options -> text), "climate trigger/limit", "climate trigger/hysteresis",
#              "climate trigger/interval" (number)
#   outputs    as Read's


@trigger("dht/climate trigger")
class ClimateTrigger(HIOTrigger):

	def arm(self, context) -> None:
		self.pin = context.get("climate trigger/data pin")
		if self.pin is None:
			raise ValueError("no Data Pin")
		self.model = model_of(context.get("climate trigger/model"))
		self.unit = text(context.get("climate trigger/unit"), "celsius")
		self.watch = text(context.get("climate trigger/watch"), "temperature")
		self.above = text(context.get("climate trigger/when"), "above") != "below"
		limit = context.get("climate trigger/limit")
		self.limit = 30.0 if limit is None else float(limit)
		hysteresis = context.get("climate trigger/hysteresis")
		self.hysteresis = abs(1.0 if hysteresis is None else float(hysteresis))
		interval = context.get("climate trigger/interval")
		self.interval = max(min_interval(self.model), int(5000 if interval is None else interval))
		self.last = None                # when it last read — None: not yet
		self.past = False               # whether it's past Limit (fired, not reset yet)

	def poll(self, context) -> bool:
		# Never blocks long: reads (a DHT transaction, a few ms) once Interval has gone by.
		now = ticks_ms()
		if self.last is not None and ticks_diff(now, self.last) < self.interval:
			return False
		self.last = now

		try:
			celsius, humidity = measure(self.pin, self.model)
		except OSError:
			return False                # missed: asked again next Interval
		value = to_unit(celsius, self.unit) if self.watch == "temperature" else humidity

		if self.past:
			# Reset once it's back past Hysteresis.
			back = value < self.limit - self.hysteresis if self.above else value > self.limit + self.hysteresis
			if back:
				self.past = False
			return False

		if (value > self.limit) if self.above else (value < self.limit):
			self.past = True
			publish(context, celsius, humidity, self.unit)
			return True
		return False
