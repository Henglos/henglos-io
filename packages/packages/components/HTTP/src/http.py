import json


# What the HTTP actions share — reading configs, walking a JSON path, and
# fitting what's published into a value (the board's 512 B by default, and
# one RESPONSE frame for all of an action's outputs).

# The most a picked value may take as JSON — with the other outputs, well
# inside one frame.
VALUE_BYTES = 384


def text(value, default: str = "") -> str:
	# A string/options config arrives as bytes (its text).
	if value is None:
		return default
	if isinstance(value, (bytes, bytearray)):
		return bytes(value).decode()
	return str(value)


def clamp(value: float, low: float, high: float) -> float:
	return low if value < low else high if value > high else value


class PathError(Exception):
	pass


def pick(document, path: str):
	# A value inside parsed JSON by a dotted path: "main.temp", "weather.0.description"
	# — a number steps into a list. An empty path is the whole document.
	current = document
	for step in path.split(".") if path else ():
		if isinstance(current, list):
			try:
				current = current[int(step)]
			except (ValueError, IndexError):
				raise PathError("no item " + step)
		elif isinstance(current, dict):
			if step not in current:
				raise PathError("no field " + step)
			current = current[step]
		else:
			raise PathError("nothing inside " + step)
	return current


def fits(value) -> bool:
	# Whether a picked value fits as one: a list or an object as JSON, text as itself.
	if isinstance(value, (list, dict)):
		return len(json.dumps(value)) <= VALUE_BYTES
	if isinstance(value, str):
		return len(value.encode()) <= VALUE_BYTES
	return True


def publish_value(context, value) -> str:
	# Publishes "value" — "" when there's none (null) or it doesn't fit; the
	# reason it doesn't, or "".
	if value is None:
		context.set("value", "")
		return ""
	if not fits(value):
		context.set("value", "")
		return "value_too_large"
	context.set("value", value)
	return ""
