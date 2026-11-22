# Switch's operations (n8n style): "<type>:<operation>" — Value is read as
# that type (string, number, boolean, array, object) and tested on its own or
# against Compare to. Pure functions over decoded values (Context.decode_value).
#
# A side that doesn't read as the type fails the test, except "not_exists".
# A list or an object bound to a "string" config arrives as its JSON text, so
# array and object operations parse text first.

import json

from ... import Logic

try:
	import re
except ImportError:          # a port built without it: no regex operations
	re = None


def _array(value):
	if isinstance(value, (list, tuple)):
		return list(value)
	if isinstance(value, str):
		try:
			parsed = json.loads(value)
		except ValueError:
			return None
		return parsed if isinstance(parsed, list) else None
	return None


def _object(value):
	if isinstance(value, dict):
		return value
	if isinstance(value, str):
		try:
			parsed = json.loads(value)
		except ValueError:
			return None
		return parsed if isinstance(parsed, dict) else None
	return None


def _boolean(value):
	# True/False when the value reads as a bool, None otherwise.
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return value != 0
	raw = Logic.text(value)
	if raw is None:
		return None
	raw = raw.strip().lower()
	if raw in ("true", "1", "yes", "on", "high"):
		return True
	if raw in ("false", "0", "no", "off", "low"):
		return False
	return None


def _string(a, op: str, b) -> bool:
	text = Logic.text(a)
	if op == "is_empty":
		return text is None or text == ""
	if op == "is_not_empty":
		return text is not None and text != ""
	other = Logic.text(b)
	if text is None or other is None:
		return False
	if op == "equals":
		return text == other
	if op == "not_equals":
		return text != other
	if op == "contains":
		return other in text
	if op == "not_contains":
		return other not in text
	if op == "starts_with":
		return text.startswith(other)
	if op == "not_starts_with":
		return not text.startswith(other)
	if op == "ends_with":
		return text.endswith(other)
	if op == "not_ends_with":
		return not text.endswith(other)
	if op in ("regex", "not_regex"):
		if re is None:
			return False
		try:
			found = re.search(other, text) is not None
		except Exception:     # not a valid pattern
			return False
		return found if op == "regex" else not found
	return False


def _compare_numbers(x: float, op: str, y: float) -> bool:
	if op == "equals":
		return Logic.evaluate("eq", x, y)
	if op == "not_equals":
		return not Logic.evaluate("eq", x, y)
	if op == "gt":
		return x > y
	if op == "lt":
		return x < y
	if op == "gte":
		return Logic.evaluate("gte", x, y)
	if op == "lte":
		return Logic.evaluate("lte", x, y)
	return False


def _number(a, op: str, b) -> bool:
	x, y = Logic.number(a), Logic.number(b)
	if x is None or y is None:
		return False
	return _compare_numbers(x, op, y)


def _boolean_op(a, op: str, b) -> bool:
	x = _boolean(a)
	if x is None:
		return False
	if op == "is_true":
		return x
	if op == "is_false":
		return not x
	y = _boolean(b)
	if y is None:
		return False
	if op == "equals":
		return x == y
	if op == "not_equals":
		return x != y
	return False


def _array_op(a, op: str, b) -> bool:
	items = _array(a)
	if items is None:
		return False
	if op == "is_empty":
		return len(items) == 0
	if op == "is_not_empty":
		return len(items) > 0
	if op in ("contains", "not_contains"):
		found = any(Logic.evaluate("eq", item, b) for item in items)
		return found if op == "contains" else not found
	if op.startswith("length_"):
		y = Logic.number(b)
		return y is not None and _compare_numbers(float(len(items)), op[len("length_"):], y)
	return False


def _object_op(a, op: str, b) -> bool:
	fields = _object(a)
	if fields is None:
		return False
	if op == "is_empty":
		return len(fields) == 0
	if op == "is_not_empty":
		return len(fields) > 0
	return False


_BY_TYPE = {
	"string": _string,
	"number": _number,
	"boolean": _boolean_op,
	"array": _array_op,
	"object": _object_op,
}


def evaluate(operation: str, a, b=None) -> bool:
	# Whether `a <operation> b` holds. An unknown operation never does.
	kind, _, op = (operation or "").partition(":")
	if op == "exists":
		return a is not None
	if op == "not_exists":
		return a is None
	test = _BY_TYPE.get(kind)
	return test is not None and test(a, op, b)
