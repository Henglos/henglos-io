import struct


# The InvenSense MPU family — MPU-6050, MPU-6500, MPU-9250 (its accelerometer
# and gyroscope; its magnetometer is a separate chip behind it). The same
# registers for all three: they differ in their WHO_AM_I and how the
# temperature reads.
#
# A driver is what sensor.py needs of a chip: its models (WHO_AM_I -> name),
# the addresses it answers at, setup, the ranges, and one reading in raw
# counts. sensor.py turns that into g, °/s and °C.

ADDRESSES = (0x68, 0x69)    # AD0 low / high

# Model -> its WHO_AM_I, and temperature as (counts per °C, °C at 0).
MODELS = {
	"mpu6050": (0x68, 340.0, 36.53),
	"mpu6500": (0x70, 333.87, 21.0),
	"mpu9250": (0x71, 333.87, 21.0),
}

# What the clones answer too (an "MPU-6050" module may carry a 6500, or a
# copy that says 0x98 / 0x72): read as the model they behave like.
IDS = {
	0x68: "mpu6050",
	0x98: "mpu6050",
	0x72: "mpu6050",
	0x70: "mpu6500",
	0x71: "mpu9250",
	0x73: "mpu9250",            # MPU-9255
}

_WHO_AM_I = 0x75
_PWR_MGMT_1 = 0x6B
_SMPLRT_DIV = 0x19
_CONFIG = 0x1A
_GYRO_CONFIG = 0x1B
_ACCEL_CONFIG = 0x1C
_ACCEL_XOUT_H = 0x3B

# Range -> its register bits (FS_SEL / AFS_SEL, bits 4:3) and counts per unit.
ACCEL_RANGES = {2: (0, 16384.0), 4: (1, 8192.0), 8: (2, 4096.0), 16: (3, 2048.0)}
GYRO_RANGES = {250: (0, 131.0), 500: (1, 65.5), 1000: (2, 32.8), 2000: (3, 16.4)}


def identify(i2c, address: int):
	# The chip's WHO_AM_I — None when nothing answers there.
	try:
		return i2c.readfrom_mem(address, _WHO_AM_I, 1)[0]
	except OSError:
		return None


def setup(i2c, address: int) -> None:
	# Awake, clocked from the gyro's oscillator (steadier than the internal
	# one), its low-pass filter at ~44 Hz — readings a flow takes now and then
	# don't need more, and it takes the vibration out.
	i2c.writeto_mem(address, _PWR_MGMT_1, b"\x01")
	i2c.writeto_mem(address, _SMPLRT_DIV, b"\x00")
	i2c.writeto_mem(address, _CONFIG, b"\x03")


def set_ranges(i2c, address: int, accel: int, gyro: int) -> None:
	i2c.writeto_mem(address, _ACCEL_CONFIG, bytes((ACCEL_RANGES[accel][0] << 3,)))
	i2c.writeto_mem(address, _GYRO_CONFIG, bytes((GYRO_RANGES[gyro][0] << 3,)))


def read(i2c, address: int):
	# (ax, ay, az, temp, gx, gy, gz) in raw counts — one burst, so the axes
	# are from the same instant.
	return struct.unpack(">hhhhhhh", i2c.readfrom_mem(address, _ACCEL_XOUT_H, 14))


def temperature(model: str, raw: int) -> float:
	_, per_degree, offset = MODELS[model]
	return raw / per_degree + offset
