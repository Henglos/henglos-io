from .....sdk.core.registry import action
from .....sdk.core.action import HIOAction, SUCCESS, FALLBACK
from ...Context import decode_value, encode_value, plain
from ...services.PacketCodec import MAX_DATA_BUFFER


@action("variables/append")
class AppendAction(HIOAction):
	# Adds Value to the end of the list Variable (an empty one when it has no
	# value yet). Max Items keeps only the newest; past MAX_DATA_BUFFER the
	# oldest go too, until it fits — a history keeps its newest.

	clears = ("append/variable", "append/value", "append/max items")

	async def execute(self, context) -> str:
		target = context.target("append/variable")
		value = context.get("append/value")
		if target is None or value is None:
			return FALLBACK

		stored = context.find_variable(target)
		current = decode_value(stored) if stored is not None else None
		items = list(current) if isinstance(current, list) else []
		items.append(plain(value))

		limit = context.get("append/max items")
		if isinstance(limit, (int, float)) and not isinstance(limit, bool) and limit >= 1:
			items = items[-int(limit):]

		changed = encode_value(target, items)
		while len(changed.data) > MAX_DATA_BUFFER and len(items) > 1:
			items.pop(0)
			changed = encode_value(target, items)

		if len(changed.data) > MAX_DATA_BUFFER:
			return FALLBACK
		return SUCCESS if context.store_variable(target, changed) else FALLBACK
