from .....sdk.core.registry import action
from .....sdk.core.action import HIOAction, SUCCESS, FALLBACK
from ...Context import decode_value, encode_value, plain
from ...services.PacketCodec import MAX_DATA_BUFFER
from ... import Logic


@action("variables/set field")
class SetFieldAction(HIOAction):
	# Sets Field of the object Variable to Value — adds it if it isn't there
	# (an empty object when the variable has no value yet).

	clears = ("set field/variable", "set field/field", "set field/value")

	async def execute(self, context) -> str:
		target = context.target("set field/variable")
		field = Logic.text(context.get("set field/field"))
		value = context.get("set field/value")
		if target is None or not field or value is None:
			return FALLBACK

		stored = context.find_variable(target)
		current = decode_value(stored) if stored is not None else None
		fields = dict(current) if isinstance(current, dict) else {}
		fields[field] = plain(value)

		changed = encode_value(target, fields)
		if len(changed.data) > MAX_DATA_BUFFER:
			return FALLBACK
		return SUCCESS if context.store_variable(target, changed) else FALLBACK
