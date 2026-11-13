from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .sensor import reading


# IMU / Read — the sensor's acceleration (g), rotation (°/s) and temperature
# (°C), whatever the chip.
#
# Wire ids (lowercased displayNames, see computeWireActionId/computeWireConfigId
# in @henglosio/workflow):
#   ACTION_ID  "imu/read"
#   configs    "read/sda pin", "read/scl pin"     (pin     -> INTEGER)
#              "read/model", "read/address"       (options -> str)
#              "read/accel range", "read/gyro range" (options -> str: "2", "250"...)
#   outputs    "ax", "ay", "az" (float, g), "gx", "gy", "gz" (float, °/s),
#              "temperature" (float, °C), "model" (text — the chip found)


@action("imu/read")
class ReadAction(HIOAction):

	async def execute(self, context):

		found = reading(context, "read")
		if found is None:
			return FALLBACK
		sensor, (ax, ay, az), (gx, gy, gz), temp = found

		context.set("ax", ax)
		context.set("ay", ay)
		context.set("az", az)
		context.set("gx", gx)
		context.set("gy", gy)
		context.set("gz", gz)
		context.set("temperature", temp)
		context.set("model", sensor.model)
		return SUCCESS
