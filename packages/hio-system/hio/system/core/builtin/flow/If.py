from henglosio.sdk.core.identifier import generate_id
from henglosio.sdk.core.filter import matches

ACTION_ID = generate_id("logic/if")

# Its Conditions (LogicComponent.ts): a filter — {"combinator", "conditions":
# [{"leftValue", "operator", "rightValue"}]} — evaluated as any action's filter
# is (henglosio.sdk's matches), "{{ name }}" read from the run and the variables.
_CONDITIONS_ID = generate_id("if/conditions")
_TRUE = generate_id("true")
_FALSE = generate_id("false")

CONFIG_IDS = (_CONDITIONS_ID,)


def evaluate(read, instance_id: int, repeats: dict, sequence: bool, lookup=None):
	# True when the conditions hold; False when they don't, or there are none.
	conditions = read(_CONDITIONS_ID)
	has_any = isinstance(conditions, dict) and any(isinstance(c, dict) and c.get("operator") for c in (conditions.get("conditions") or []))
	return (_TRUE if has_any and matches(conditions, lookup) else _FALSE), None
