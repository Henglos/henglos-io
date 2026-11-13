from .....sdk.core.registry import action
from .....sdk.core.action import HIOAction, SUCCESS, FALLBACK


@action("variables/remove")
class RemoveVariableAction(HIOAction):
	# Variable back to no value: configs bound to it get nothing until a Set
	# writes it again (Start's initial value only seeds it on a new recording).
	# A variable that already had none is no error.

	clears = ("remove/variable",)

	async def execute(self, context) -> str:
		target = context.target("remove/variable")
		if target is None:
			return FALLBACK
		context.drop_variable(target)
		return SUCCESS
