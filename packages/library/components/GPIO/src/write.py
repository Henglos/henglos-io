from machine import Pin

from henglosio.sdk import HIOAction, action, SUCCESS, FALLBACK


# GPIO Write — sets the pin as output and drives it HIGH or LOW.
#
# Wire ids come from the manifest's lowercased displayNames (see
# computeWireActionId/computeWireConfigId in @henglosio/workflow):
#   ACTION_ID  "gpio/write"
#   configs    "write/pin"   (pin     -> INTEGER)
#              "write/value" (toggle -> BOOL)
#   output     "value"       (bool, echoed back for chaining)
@action("gpio/write")
class WriteAction(HIOAction):

	async def execute(self, context):

		pin = context.get("write/pin")
		value = context.get("write/value")

		if pin is None or value is None:
			return FALLBACK

		# One instance serves every "GPIO Write" node, each with its own pin —
		# so the Pin is built per run instead of kept from initialize().
		Pin(pin, Pin.OUT).value(1 if value else 0)

		context.set("value", bool(value))
		return SUCCESS
