import math

from machine import Pin, SoftI2C

from . import mpu


# What the IMU actions share — an accelerometer + gyroscope on I2C, whatever
# the chip: the actions speak g, °/s and °C, and a driver per chip family
# (mpu.py: MPU-6050 / 6500 / 9250) knows its registers. A new chip is a new
# driver in DRIVERS — the actions don't change.
#
# Axes are the chip's, as printed on most modules: X forward, Y left, Z up.
# Lying flat, at rest, it reads az = +1 g.

DRIVERS = (mpu,)

# Model -> its driver. "auto": whichever chip answers, by its WHO_AM_I.
MODELS = {}
for _driver in DRIVERS:
	for _model in _driver.MODELS:
		MODELS[_model] = _driver


class Sensor:

	def __init__(self, i2c, driver, address: int, model: str) -> None:
		self._i2c = i2c
		self._driver = driver
		self.address = address
		self.model = model
		self._ranges = None
		# Calibrate's: subtracted from every reading, in g and °/s.
		self.accel_offset = (0.0, 0.0, 0.0)
		self.gyro_offset = (0.0, 0.0, 0.0)
		# Orientation's filter state: (pitch, roll, ticks of the last reading).
		self.attitude = None
		driver.setup(i2c, address)

	def ranges(self, accel: int, gyro: int) -> None:
		# Written only when they change — actions on one chip may ask for different ones.
		if self._ranges != (accel, gyro):
			self._driver.set_ranges(self._i2c, self.address, accel, gyro)
			self._ranges = (accel, gyro)

	def read(self):
		# ((ax, ay, az) in g, (gx, gy, gz) in °/s, temperature in °C), offsets applied.
		ax, ay, az, temp, gx, gy, gz = self._driver.read(self._i2c, self.address)
		accel, gyro = self._ranges
		a = self._driver.ACCEL_RANGES[accel][1]
		g = self._driver.GYRO_RANGES[gyro][1]
		ox, oy, oz = self.accel_offset
		rx, ry, rz = self.gyro_offset
		return (
			(ax / a - ox, ay / a - oy, az / a - oz),
			(gx / g - rx, gy / g - ry, gz / g - rz),
			self._driver.temperature(self.model, temp),
		)


_buses = {}                 # (sda, scl) -> SoftI2C
_sensors = {}               # (sda, scl, address, model) as configured -> Sensor


def _bus(sda: int, scl: int):
	# One bus per pair of pins — the Display on the same pins has its own; it's
	# software I2C, they take turns.
	found = _buses.get((sda, scl))
	if found is None:
		found = _buses[(sda, scl)] = SoftI2C(scl=Pin(scl), sda=Pin(sda), freq=400000)
	return found


def _find(i2c, address, model: str):
	# (driver, address, model) of the chip — the one at `address` (or at any
	# address its driver answers at, for "auto"); `model` "auto" by its
	# WHO_AM_I. None when nothing answers.
	drivers = DRIVERS if model == "auto" else (MODELS[model],)
	for driver in drivers:
		for at in (driver.ADDRESSES if address is None else (address,)):
			found = driver.identify(i2c, at)
			if found is None:
				continue
			if model != "auto":
				return driver, at, model
			# An ID it doesn't list: a chip that answers like the family's first.
			return driver, at, driver.IDS.get(found, next(iter(driver.MODELS)))
	return None


def sensor(context, action: str):
	# The action's sensor, set up and with its ranges — None when a pin is
	# missing or nothing answers (wrong pins or address, unpowered).
	sda = context.get(action + "/sda pin")
	scl = context.get(action + "/scl pin")
	if sda is None or scl is None or sda == scl:
		return None
	model = text(context.get(action + "/model"), "auto")
	address = text(context.get(action + "/address"), "auto")
	if model != "auto" and model not in MODELS:
		return None
	address = None if address == "auto" else int(address, 16)

	key = (sda, scl, address, model)
	found = _sensors.get(key)
	if found is None:
		i2c = _bus(sda, scl)
		chip = _find(i2c, address, model)
		if chip is None:
			return None
		driver, at, resolved = chip
		# Every action on that chip shares one — and Calibrate's offsets with
		# it — however each names it (Auto, or the model).
		for other in _sensors.values():
			if other.address == at and other._i2c is i2c:
				found = other
				# A model picked by name is what the chip is, for all of them.
				if model != "auto":
					found.model = resolved
				break
		if found is None:
			try:
				found = Sensor(i2c, driver, at, resolved)
			except OSError:
				return None
		_sensors[key] = found

	accel = _range(context.get(action + "/accel range"), mpu.ACCEL_RANGES, 2)
	gyro = _range(context.get(action + "/gyro range"), mpu.GYRO_RANGES, 250)
	try:
		found.ranges(accel, gyro)
	except OSError:
		forget(found)
		return None
	return found


def _range(value, ranges, default: int) -> int:
	# A range option ("2", "250"...) — the default when it's missing or not one of them.
	try:
		chosen = int(text(value, str(default)))
	except ValueError:
		return default
	return chosen if chosen in ranges else default


def forget(found: Sensor) -> None:
	# Drops a sensor that stopped answering — the next action looks for it again.
	for key, value in list(_sensors.items()):
		if value is found:
			del _sensors[key]


def reading(context, action: str):
	# (sensor, accel, gyro, temperature) — None when there's no sensor or it stopped answering.
	found = sensor(context, action)
	if found is None:
		return None
	try:
		accel, gyro, temp = found.read()
	except OSError:
		forget(found)
		return None
	return found, accel, gyro, temp


def tilt(accel):
	# (pitch, roll) in degrees from gravity alone: pitch positive when the
	# front (+X) dips, roll positive when the right side (-Y) dips — the same
	# signs as the gyro's rotation about Y and X (right-hand rule), so
	# Orientation adds gy and gx to them as they are.
	ax, ay, az = accel
	pitch = math.degrees(math.atan2(-ax, math.sqrt(ay * ay + az * az)))
	roll = math.degrees(math.atan2(ay, az))
	return pitch, roll


def text(value, default: str) -> str:
	# A string/options config arrives as a str.
	return str(value) if value is not None else default


def number(value, default: float) -> float:
	return default if value is None else value


def clamp(value: float, low: float, high: float) -> float:
	return low if value < low else high if value > high else value
