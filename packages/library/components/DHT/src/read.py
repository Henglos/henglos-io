from henglosio.sdk import HIOAction, action, sleep_ms, SUCCESS, FALLBACK

from .sensor import measure, min_interval, model_of, publish, text


# DHT / Read — the temperature and the humidity, with how hot it feels
# (heat_index) and where the air would fog (dew_point). A DHT sometimes
# misses a reading: it's asked again once, as soon as it can answer.
#
# Wire ids:
#   ACTION_ID  "dht/read"
#   configs    "read/data pin" (pin     -> INTEGER), "read/model" (options -> str: dht11 | dht22),
#              "read/unit" (options -> str: celsius | fahrenheit)
#   outputs    "temperature", "humidity" (%), "heat_index", "dew_point" (float), "error" (text)

_ATTEMPTS = 2


@action("dht/read")
class ReadAction(HIOAction):

	async def execute(self, context):
		pin = context.get("read/data pin")
		if pin is None:
			context.set("error", "no_pin")
			return FALLBACK
		model = model_of(context.get("read/model"))
		unit = text(context.get("read/unit"), "celsius")

		for attempt in range(_ATTEMPTS):
			try:
				celsius, humidity = measure(pin, model)
			except OSError:
				if attempt + 1 < _ATTEMPTS:
					await sleep_ms(min_interval(model))
				continue
			publish(context, celsius, humidity, unit)
			context.set("error", "")
			return SUCCESS

		# Nothing answered: the wiring, the pull-up, the model picked, or its power.
		context.set("error", "no_answer")
		return FALLBACK
