from henglosio.sdk.core.identifier import generate_id
from henglosio.sdk.core.filter import matches

ACTION_ID = generate_id("logic/switch")

# Its Routing Rules (LogicComponent.ts): a fixedCollection — {"values": [rule…]},
# each rule {"conditions": <filter>, "outputKey"} — rule N going out "case_N"
# (the studio's dynamicOutputs), the first whose conditions hold; Default when
# none does. A rule's conditions are evaluated as any filter (henglosio.sdk's
# matches); one without any never holds.
_RULES_ID = generate_id("switch/routing rules")
_OTHERWISE = generate_id("otherwise")

CONFIG_IDS = (_RULES_ID,)


def _holds(conditions, lookup) -> bool:
	if not isinstance(conditions, dict):
		return False
	if not any(isinstance(c, dict) and c.get("operator") for c in (conditions.get("conditions") or [])):
		return False
	return matches(conditions, lookup)


def evaluate(read, instance_id: int, repeats: dict, sequence: bool, lookup=None):
	rules = read(_RULES_ID)
	values = rules.get("values") if isinstance(rules, dict) else None
	for index, rule in enumerate(values if isinstance(values, list) else []):
		if isinstance(rule, dict) and _holds(rule.get("conditions"), lookup):
			return generate_id("case_%d" % (index + 1)), None
	return _OTHERWISE, None
