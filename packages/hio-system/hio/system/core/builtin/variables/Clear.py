from henglosio.sdk.core.registry import action
from henglosio.sdk.core.action import HIOAction, SUCCESS, FALLBACK
from ...Context import encode_value
from ...services.PacketCodec import DataType


@action("variables/clear")
class ClearAction(HIOAction):
	# Empties the list or object Variable — an object stays an object, anything
	# else becomes an empty list.

	clears = ("clear/variable",)

	async def execute(self, context) -> str:
		target = context.target("clear/variable")
		if target is None:
			return FALLBACK

		stored = context.find_variable(target)
		empty = {} if stored is not None and stored.data_type == DataType.OBJECT else []
		return SUCCESS if context.store_variable(target, encode_value(target, empty)) else FALLBACK
