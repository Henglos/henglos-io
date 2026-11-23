# henglosio.sdk.matches: a `filter` config's conditions, evaluated by the
# action — the same operations as If and Switch, "{{ name }}" looked up.

from henglosio.sdk import condition, matches
from henglosio.sdk.core.filter import resolve


def _filter(*conditions, combinator="and", case_sensitive=True):
	return {
		"combinator": combinator,
		"conditions": [{"leftValue": left, "operator": op, "rightValue": right} for left, op, right in conditions],
		"caseSensitive": case_sensitive,
	}


def test_and_needs_every_condition_or_any():
	both = _filter(("5", "number:gt", "1"), ("2", "number:lt", "3"))
	assert matches(both)
	one = _filter(("5", "number:gt", "1"), ("9", "number:lt", "3"))
	assert not matches(one)
	assert matches({**one, "combinator": "or"})


def test_no_filter_or_no_conditions_holds():
	assert matches(None)
	assert matches({"combinator": "and", "conditions": []})
	assert matches({"combinator": "or", "conditions": [{"leftValue": "x", "operator": ""}]})   # no operation: not a condition


def test_names_are_looked_up_keeping_their_type():
	values = {"temperature": 31.5, "room": "lab", "on": True}
	assert resolve("{{ temperature }}", values.get) == 31.5
	assert resolve("room {{room}}!", values.get) == "room lab!"
	assert resolve("{{ temperature }}", None) == "{{ temperature }}"
	assert resolve("{{ missing }} x", values.get) == " x"
	assert matches(_filter(("{{ temperature }}", "number:gte", "30"), ("{{on}}", "boolean:is_true", None)), values.get)
	assert not matches(_filter(("{{ temperature }}", "number:gt", "40")), values.get)


def test_case_sensitivity():
	assert not matches(_filter(("Hello", "string:equals", "hello")))
	assert matches(_filter(("Hello", "string:equals", "hello"), case_sensitive=False))
	assert matches(_filter(("GPIO12", "string:starts_with", "gpio"), case_sensitive=False))


def test_the_conditions_are_the_logic_actions():
	assert condition("number:equals", "10", 10.0)
	assert condition("array:contains", [1, 2, 3], "2")
	assert condition("object:is_not_empty", '{"a": 1}')
	assert condition("string:not_exists", None)
	assert not condition("nope:equals", "x", "x")
