from henglosio.sdk.core.registry import action
from henglosio.sdk.core.action import HIOAction, SUCCESS, FALLBACK


@action("variables/set")
class SetVariableAction(HIOAction):
	# Stores Value in Variable, with the type it arrived as (a literal, a
	# bind, another variable or a script — already converted to what the
	# studio declared). Fallback without either, or without room for one more
	# variable.

	clears = ("set/variable", "set/value")

	async def execute(self, context) -> str:
		target = context.target("set/variable")
		value = context.config("set/value")
		if target is None or value is None:
			return FALLBACK
		return SUCCESS if context.store_variable(target, value) else FALLBACK
