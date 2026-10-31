from hio.sdk import HIOAction, action, sleep_ms, SUCCESS, FALLBACK

from .sensor import clamp, forget, number, sensor


# IMU / Calibrate — measures the sensor's offsets while it rests, for every
# action on the same chip: the gyro should read 0 °/s still (it reads a few
# off), and — with Level on, the sensor lying flat — the accelerometer
# exactly (0, 0, 1 g). Goes out Fallback, keeping the old offsets, when the
# sensor moved while it measured.
#
# Wire ids:
#   ACTION_ID  "imu/calibrate"
#   configs    as Read's, and "calibrate/samples" (number -> FLOAT_32),
#              "calibrate/level" (toggle -> BOOL)
#   outputs    "gx_offset", "gy_offset", "gz_offset" (float, °/s),
#              "ax_offset", "ay_offset", "az_offset" (float, g)

_SAMPLES = 100
_EVERY_MS = 5
# A rotation this far from the average while measuring: it moved.
_MOVED_DPS = 8.0


@action("imu/calibrate")
class CalibrateAction(HIOAction):

	async def execute(self, context):

		found = sensor(context, "calibrate")
		if found is None:
			return FALLBACK

		samples = int(clamp(number(context.get("calibrate/samples"), _SAMPLES), 10, 500))
		level = context.get("calibrate/level")
		level = True if level is None else bool(level)

		# Measured without the old offsets.
		old = (found.accel_offset, found.gyro_offset)
		found.accel_offset = (0.0, 0.0, 0.0)
		found.gyro_offset = (0.0, 0.0, 0.0)

		accels, gyros = [], []
		try:
			for _ in range(samples):
				accel, gyro, _ = found.read()
				accels.append(accel)
				gyros.append(gyro)
				await sleep_ms(_EVERY_MS)
		except OSError:
			found.accel_offset, found.gyro_offset = old
			forget(found)
			return FALLBACK

		gyro_offset = tuple(sum(g[i] for g in gyros) / samples for i in range(3))
		moved = any(abs(g[i] - gyro_offset[i]) > _MOVED_DPS for g in gyros for i in range(3))
		if moved:
			found.accel_offset, found.gyro_offset = old
			return FALLBACK

		accel_offset = (0.0, 0.0, 0.0)
		if level:
			mean = tuple(sum(a[i] for a in accels) / samples for i in range(3))
			accel_offset = (mean[0], mean[1], mean[2] - 1.0)

		found.gyro_offset = gyro_offset
		found.accel_offset = accel_offset
		found.attitude = None               # Orientation starts over from the new zero

		context.set("gx_offset", gyro_offset[0])
		context.set("gy_offset", gyro_offset[1])
		context.set("gz_offset", gyro_offset[2])
		context.set("ax_offset", accel_offset[0])
		context.set("ay_offset", accel_offset[1])
		context.set("az_offset", accel_offset[2])
		return SUCCESS
