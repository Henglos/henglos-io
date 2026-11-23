# Conditions (n8n style): "<type>:<operation>" — a value read as that type
# (string, number, boolean, array, object) and tested on its own or against
# another. What Logic's If and Switch test, and what a `filter` config holds
# (see filter.py). Pure functions over plain values (str, int, float, bool,
# list, dict, None).
#
# A side that doesn't read as the type fails the test, except "not_exists". A
# list or an object that arrives as text (bound to a "string" config) is its
# JSON: array and object operations parse text first.

import json

try:
	import re
except ImportError:          # a port built without it: no regex operations
	re = None

# float32 round trip: a bound 0.1 is 0.10000000149 — equal to a typed "0.1".
_TOLERANCE = 1e-6


def text(value) -> "str | None":
	# A value as text: bools as "true"/"false", whole floats without ".0",
	# bytes decoded. None when it's missing or isn't text.
	if value is None:
		return None
	if isinstance(value, str):
		return value
	if isinstance(value, bool):
		return "true" if value else "false"
	if isinstance(value, float):
		return str(int(value)) if value == int(value) else repr(value)
	if isinstance(value, int):
		return str(value)
	try:
		return bytes(value).decode()
	except Exception:
		return None


def number(value) -> "float | None":
	# A value as a number: bools as 1/0, text parsed ("10", " 2.5 "). None
	# when it's missing or doesn't read as one.
	if value is None:
		return None
	if isinstance(value, bool):
		return 1.0 if value else 0.0
	if isinstance(value, (int, float)):
		return float(value)
	raw = text(value)
	if raw is None:
		return None
	raw = raw.strip()
	if not raw:
		return None
	try:
		return float(raw)
	except ValueError:
		return None


def equal(a, b) -> bool:
	# Equal as numbers (within _TOLERANCE) when both read as one, as text otherwise.
	x, y = number(a), number(b)
	if x is not None and y is not None:
		return abs(x - y) <= _TOLERANCE * max(1.0, abs(x), abs(y))
	ta, tb = text(a), text(b)
	return ta is not None and tb is not None and ta == tb


def boolean(value) -> "bool | None":
	# True/False when the value reads as a bool, None otherwise.
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return value != 0
	raw = text(value)
	if raw is None:
		return None
	raw = raw.strip().lower()
	if raw in ("true", "1", "yes", "on", "high"):
		return True
	if raw in ("false", "0", "no", "off", "low"):
		return False
	return None


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


def _string(a, op: str, b, case_sensitive: bool) -> bool:
	value = text(a)
	if op == "is_empty":
		return value is None or value == ""
	if op == "is_not_empty":
		return value is not None and value != ""
	other = text(b)
	if value is None or other is None:
		return False
	if not case_sensitive:
		value, other = value.lower(), other.lower()
	if op == "equals":
		return value == other
	if op == "not_equals":
		return value != other
	if op == "contains":
		return other in value
	if op == "not_contains":
		return other not in value
	if op == "starts_with":
		return value.startswith(other)
	if op == "not_starts_with":
		return not value.startswith(other)
	if op == "ends_with":
		return value.endswith(other)
	if op == "not_ends_with":
		return not value.endswith(other)
	if op in ("regex", "not_regex"):
		if re is None:
			return False
		try:
			found = re.search(other, value) is not None
		except Exception:     # not a valid pattern
			return False
		return found if op == "regex" else not found
	return False


def _compare_numbers(x: float, op: str, y: float) -> bool:
	if op == "equals":
		return equal(x, y)
	if op == "not_equals":
		return not equal(x, y)
	if op == "gt":
		return x > y
	if op == "lt":
		return x < y
	if op == "gte":
		return x >= y or equal(x, y)
	if op == "lte":
		return x <= y or equal(x, y)
	return False


def _number(a, op: str, b, case_sensitive: bool) -> bool:
	x, y = number(a), number(b)
	if x is None or y is None:
		return False
	return _compare_numbers(x, op, y)


def _boolean(a, op: str, b, case_sensitive: bool) -> bool:
	x = boolean(a)
	if x is None:
		return False
	if op == "is_true":
		return x
	if op == "is_false":
		return not x
	y = boolean(b)
	if y is None:
		return False
	if op == "equals":
		return x == y
	if op == "not_equals":
		return x != y
	return False


def _array_op(a, op: str, b, case_sensitive: bool) -> bool:
	items = _array(a)
	if items is None:
		return False
	if op == "is_empty":
		return len(items) == 0
	if op == "is_not_empty":
		return len(items) > 0
	if op in ("contains", "not_contains"):
		found = any(equal(item, b) for item in items)
		return found if op == "contains" else not found
	if op.startswith("length_"):
		y = number(b)
		return y is not None and _compare_numbers(float(len(items)), op[len("length_"):], y)
	return False


def _object_op(a, op: str, b, case_sensitive: bool) -> bool:
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
	"boolean": _boolean,
	"array": _array_op,
	"object": _object_op,
}


def evaluate(operation: str, a, b=None, case_sensitive: bool = True) -> bool:
	# Whether `a <operation> b` holds — text compared ignoring case when not
	# `case_sensitive`. An unknown operation never does.
	kind, _, op = (operation or "").partition(":")
	if op == "exists":
		return a is not None
	if op == "not_exists":
		return a is None
	test = _BY_TYPE.get(kind)
	return test is not None and test(a, op, b, case_sensitive)
