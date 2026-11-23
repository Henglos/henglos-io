# A `filter` config's conditions, evaluated: what an action does with one.
#
#   from henglosio.sdk import matches
#
#   async def execute(self, ctx):
#       if matches(ctx.get("check/conditions"), ctx.get):
#           ...
#
# The filter arrives as {"combinator": "and" | "or", "conditions": [{"leftValue",
# "operator", "rightValue"}], "caseSensitive": bool}. A value is typed in the
# studio — "{{ name }}" in it is what `lookup` (ctx.get) gives for that name:
# the whole value "{{ temperature }}" keeps its type (a number stays one), one
# inside text ("room {{ room }}") goes in as text. The operators are the
# conditions' (see conditions.py).

from .conditions import evaluate, text

_OPEN = "{{"
_CLOSE = "}}"


def resolve(value, lookup=None):
	# `value` with its "{{ name }}"s looked up — as it is without `lookup`.
	if lookup is None or not isinstance(value, str) or _OPEN not in value:
		return value

	stripped = value.strip()
	if stripped.startswith(_OPEN) and stripped.endswith(_CLOSE) and stripped.count(_OPEN) == 1:
		return lookup(stripped[len(_OPEN):-len(_CLOSE)].strip())

	out = ""
	rest = value
	while True:
		start = rest.find(_OPEN)
		end = rest.find(_CLOSE, start + len(_OPEN)) if start != -1 else -1
		if start == -1 or end == -1:
			return out + rest
		found = text(lookup(rest[start + len(_OPEN):end].strip()))
		out += rest[:start] + ("" if found is None else found)
		rest = rest[end + len(_CLOSE):]


def matches(filter_value, lookup=None) -> bool:
	# Whether the filter's conditions hold — every one with "and", any with
	# "or". None (an unset filter) and one without conditions hold.
	if not isinstance(filter_value, dict):
		return True
	conditions = [c for c in (filter_value.get("conditions") or []) if isinstance(c, dict) and c.get("operator")]
	if not conditions:
		return True

	any_of = filter_value.get("combinator") == "or"
	case_sensitive = filter_value.get("caseSensitive", True) is not False
	for condition in conditions:
		holds = evaluate(
			condition["operator"],
			resolve(condition.get("leftValue"), lookup),
			resolve(condition.get("rightValue"), lookup),
			case_sensitive,
		)
		if any_of and holds:
			return True
		if not any_of and not holds:
			return False
	return not any_of
