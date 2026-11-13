from machine import Pin

from hio.sdk import HIOAction, action, SUCCESS, FALLBACK


# GPIO Read — sets the pin as input and publishes its current level.
#
# Wire ids come from the manifest's lowercased displayNames (see
# computeWireActionId/computeWireConfigId in @henglosio/workflow):
#   ACTION_ID  "gpio/read"
#   configs    "read/pin" (pin     -> INTEGER)
#   output     "value"    (bool)
@action("gpio/read")
class ReadAction(HIOAction):

	async def execute(self, context):

		pin = context.get("read/pin")

		if pin is None:
			return FALLBACK

		# One instance serves every "GPIO Read" node, each with its own pin —
		# so the Pin is built per run instead of kept from initialize().
		value = Pin(pin, Pin.IN).value()

		context.set("value", value != 0)
		return SUCCESS
