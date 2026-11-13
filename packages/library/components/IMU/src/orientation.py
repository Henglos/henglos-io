import time

from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .sensor import clamp, number, reading, tilt


# IMU / Orientation — pitch and roll, steady and quick at once: a
# complementary filter. The gyro follows quick turns but drifts over time;
# gravity (the accelerometer) never drifts but shakes with every bump — each
# run turns the last angles by what the gyro measured, then pulls them a
# little towards gravity's. Gyro Weight is how little.
#
# Pitch: positive when the front (+X) dips. Roll: positive when the right
# side dips. No yaw: turning about the vertical changes nothing gravity can
# see, and the gyro alone drifts away from it.
#
# Wire ids:
#   ACTION_ID  "imu/orientation"
#   configs    as Read's, and "orientation/gyro weight" (float, %)
#   outputs    "pitch", "roll" (float, degrees)

_GYRO_WEIGHT = 96.0
# Runs further apart than this start over from gravity's angles — the gyro
# can't be trusted across a long gap (the flow did other things).
_MAX_GAP_MS = 500


@action("imu/orientation")
class OrientationAction(HIOAction):

	async def execute(self, context):

		found = reading(context, "orientation")
		if found is None:
			return FALLBACK
		sensor, accel, gyro, _ = found

		weight = clamp(number(context.get("orientation/gyro weight"), _GYRO_WEIGHT), 0.0, 99.9) / 100

		pitch, roll = tilt(accel)
		now = time.ticks_ms()
		if sensor.attitude is not None:
			last_pitch, last_roll, then = sensor.attitude
			gap = time.ticks_diff(now, then)
			if 0 < gap <= _MAX_GAP_MS:
				seconds = gap / 1000
				pitch = weight * (last_pitch + gyro[1] * seconds) + (1 - weight) * pitch
				roll = weight * (last_roll + gyro[0] * seconds) + (1 - weight) * roll
		sensor.attitude = (pitch, roll, now)

		context.set("pitch", pitch)
		context.set("roll", roll)
		return SUCCESS
