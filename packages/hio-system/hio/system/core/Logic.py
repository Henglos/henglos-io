# The conditions of the built-in Logic actions ("logic/if", "logic/switch"):
# one operand tested on its own, or compared with another. Pure functions —
# ExecuteCommand hands them decoded values (Context.decode_value).
#
# An operand comes typed or as text: a bound output or variable keeps its
# DataType (a number, a bool), a typed-in one is text (a "string" config).
# So comparing goes by what both sides can be: as numbers when both read as
# one ("10" and 10.0 are equal, "9" < "10"), as text otherwise. A missing
# operand (None: unbound, or its source never ran) is empty, and fails every
# comparison.

from henglosio.sdk.core.conditions import equal as _equal, number, text  # noqa: F401 — the same rules as the conditions'

UNARY = ("is_true", "is_false", "is_empty", "is_not_empty")


def truthy(value) -> bool:
	# Whether an operand counts as true: a true bool, a non-zero number, or
	# the text "true", "1", "yes", "on" or "high" (any case).
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return value != 0
	raw = text(value)
	return raw is not None and raw.strip().lower() in ("true", "1", "yes", "on", "high")


def evaluate(condition: str, a, b=None) -> bool:
	# Whether `a <condition> b` holds. An unknown condition never does.

	if condition == "is_true":
		return truthy(a)
	if condition == "is_false":
		return a is not None and not truthy(a)
	if condition == "is_empty":
		raw = text(a)
		return raw is None or raw == ""
	if condition == "is_not_empty":
		raw = text(a)
		return raw is not None and raw != ""

	if a is None or b is None:
		return False

	if condition == "eq":
		return _equal(a, b)
	if condition == "ne":
		return not _equal(a, b)

	if condition in ("gt", "gte", "lt", "lte"):
		x, y = number(a), number(b)
		if x is None or y is None:
			return False
		if condition == "gt":
			return x > y
		if condition == "gte":
			return x >= y or _equal(x, y)
		if condition == "lt":
			return x < y
		return x <= y or _equal(x, y)

	ta, tb = text(a), text(b)
	if ta is None or tb is None:
		return False
	if condition == "contains":
		return tb in ta
	if condition == "not_contains":
		return tb not in ta
	if condition == "starts_with":
		return ta.startswith(tb)
	if condition == "ends_with":
		return ta.endswith(tb)

	return False
