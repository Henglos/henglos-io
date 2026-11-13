import math

from hio.sdk import HIOAction, action, FALLBACK

from .sensor import clamp, number, reading


# IMU / Motion — branches on what the sensor is doing: Still, Moving, or Free
# Fall. At rest it feels exactly gravity (1 g) and no rotation; moving, the
# acceleration strays from 1 g or it turns; falling, it feels next to nothing.
#
# Wire ids:
#   ACTION_ID  "imu/motion"
#   configs    as Read's, and "motion/accel threshold" (float, g),
#              "motion/gyro threshold" (float, °/s)
#   outputs    "acceleration" (float, g — the total), "rotation" (float, °/s — the total),
#              "motion" (text: "still" | "moving" | "free fall")
#   goes out   "still" | "moving" | "free_fall"

_ACCEL_THRESHOLD = 0.15
_GYRO_THRESHOLD = 20.0
# Under this much, it's falling: nothing holds it up.
_FREE_FALL_G = 0.3


@action("imu/motion")
class MotionAction(HIOAction):

	async def execute(self, context):

		found = reading(context, "motion")
		if found is None:
			return FALLBACK
		_, (ax, ay, az), (gx, gy, gz), _ = found

		accel_threshold = clamp(number(context.get("motion/accel threshold"), _ACCEL_THRESHOLD), 0.01, 4.0)
		gyro_threshold = clamp(number(context.get("motion/gyro threshold"), _GYRO_THRESHOLD), 1.0, 1000.0)

		acceleration = math.sqrt(ax * ax + ay * ay + az * az)
		rotation = math.sqrt(gx * gx + gy * gy + gz * gz)

		if acceleration < _FREE_FALL_G:
			state = "free_fall"
		elif abs(acceleration - 1.0) > accel_threshold or rotation > gyro_threshold:
			state = "moving"
		else:
			state = "still"

		context.set("acceleration", acceleration)
		context.set("rotation", rotation)
		context.set("motion", state.replace("_", " "))
		return state
