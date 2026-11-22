from henglosio.sdk.core.identifier import generate_id
from ... import Logic

ACTION_ID = generate_id("logic/if")

_CONDITIONS = (
	(generate_id("if/value"), generate_id("if/condition"), generate_id("if/compare to")),
	(generate_id("if/value 2"), generate_id("if/condition 2"), generate_id("if/compare to 2")),
)
_COMBINE_ID = generate_id("if/combine")
_TRUE = generate_id("true")
_FALSE = generate_id("false")

CONFIG_IDS = tuple(config_id for condition in _CONDITIONS for config_id in condition) + (_COMBINE_ID,)


def evaluate(read, instance_id: int, repeats: dict, sequence: bool):
	# True when the condition holds — or both / either, with Combine.
	def holds(condition_ids) -> bool:
		value_id, condition_id, compare_id = condition_ids
		condition = Logic.text(read(condition_id)) or "eq"
		return Logic.evaluate(condition, read(value_id), None if condition in Logic.UNARY else read(compare_id))

	combine = Logic.text(read(_COMBINE_ID)) or "none"
	result = holds(_CONDITIONS[0])
	if combine == "and":
		result = result and holds(_CONDITIONS[1])
	elif combine == "or":
		result = result or holds(_CONDITIONS[1])
	return (_TRUE if result else _FALSE), None
