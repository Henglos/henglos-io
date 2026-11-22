# builtin/flow/operators.py — Switch's operations, "<type>:<operation>": Value
# read as that type and tested on its own or against Compare to.

from hio.system.core.builtin.flow.operators import evaluate


def test_presence_is_the_same_for_every_type():
	for kind in ("string", "number", "boolean", "array", "object"):
		assert evaluate(kind + ":exists", 0)
		assert not evaluate(kind + ":exists", None)
		assert evaluate(kind + ":not_exists", None)
		assert not evaluate(kind + ":not_exists", "")


def test_string():
	assert evaluate("string:equals", "on", "on")
	assert evaluate("string:equals", True, "true")                # a bool as its text
	assert evaluate("string:equals", 1.0, "1")                    # a whole float without ".0"
	assert evaluate("string:not_equals", "on", "off")
	assert evaluate("string:contains", "hello world", "lo w")
	assert evaluate("string:not_contains", "hello", "x")
	assert evaluate("string:starts_with", "GPIO12", "GPIO")
	assert evaluate("string:not_starts_with", "GPIO12", "PIN")
	assert evaluate("string:ends_with", "GPIO12", "12")
	assert evaluate("string:not_ends_with", "GPIO12", "13")
	assert evaluate("string:is_empty", "") and evaluate("string:is_empty", None)
	assert evaluate("string:is_not_empty", "x") and not evaluate("string:is_not_empty", None)


def test_string_regex():
	assert evaluate("string:regex", "GPIO12", r"^GPIO\d+$")
	assert evaluate("string:not_regex", "PIN", r"^GPIO")
	assert not evaluate("string:regex", "x", "(")                 # not a valid pattern: fails, no error
	assert not evaluate("string:not_regex", "x", "(")


def test_string_with_a_missing_side_fails():
	assert not evaluate("string:equals", None, "x")
	assert not evaluate("string:not_equals", "x", None)


def test_number():
	assert evaluate("number:equals", "10", 10.0)
	assert evaluate("number:equals", 0.1000000015, "0.1")         # a float32 round trip still equals
	assert evaluate("number:not_equals", 1, 2)
	assert evaluate("number:gt", "10", "9")                        # not "10" < "9" as text
	assert evaluate("number:lt", 1, 2)
	assert evaluate("number:gte", 2, 2) and evaluate("number:lte", 2, 2)
	assert not evaluate("number:gt", "abc", 1)                     # not a number: fails
	assert not evaluate("number:equals", None, 0)


def test_boolean():
	assert evaluate("boolean:is_true", True)
	assert evaluate("boolean:is_true", "on") and evaluate("boolean:is_true", 1)
	assert evaluate("boolean:is_false", "off") and evaluate("boolean:is_false", 0)
	assert evaluate("boolean:equals", True, "true")
	assert evaluate("boolean:not_equals", True, "no")
	assert not evaluate("boolean:is_true", "maybe")                # doesn't read as a bool
	assert not evaluate("boolean:is_false", "maybe")
	assert not evaluate("boolean:equals", True, "maybe")


def test_array():
	assert evaluate("array:contains", [1, 2, 3], "2")              # compared like Logic's eq
	assert evaluate("array:contains", '["a", "b"]', "b")           # a list bound to a string config: its JSON
	assert evaluate("array:not_contains", [1, 2], 3)
	assert evaluate("array:is_empty", []) and evaluate("array:is_not_empty", [0])
	assert evaluate("array:length_equals", [1, 2], "2")
	assert evaluate("array:length_not_equals", [1, 2], 3)
	assert evaluate("array:length_gt", [1, 2], 1) and evaluate("array:length_lt", [1], 2)
	assert evaluate("array:length_gte", [1, 2], 2) and evaluate("array:length_lte", [1, 2], 2)
	assert not evaluate("array:is_empty", "not json")
	assert not evaluate("array:is_empty", {"a": 1})                # an object isn't a list
	assert not evaluate("array:length_gt", [1], "abc")


def test_object():
	assert evaluate("object:is_empty", {}) and evaluate("object:is_empty", "{}")
	assert evaluate("object:is_not_empty", {"a": 1}) and evaluate("object:is_not_empty", '{"a": 1}')
	assert not evaluate("object:is_empty", [])                     # a list isn't an object
	assert not evaluate("object:equals", {"a": 1}, {"a": 1})       # no such operation


def test_unknown_operations_never_hold():
	assert not evaluate("string:nope", "x", "x")
	assert not evaluate("nope:equals", "x", "x")
	assert not evaluate("", "x", "x")
	assert not evaluate(None, "x", "x")
