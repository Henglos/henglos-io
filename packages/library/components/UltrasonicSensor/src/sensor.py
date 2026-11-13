from machine import Pin, time_pulse_us
import time


# The measuring both actions share — an HC-SR04-style sensor (also the
# JSN-SR04T and other 4-pin modules): a 10 µs pulse on Trigger makes it send a
# burst of ultrasound; Echo then stays HIGH for as long as the sound took to
# hit something and come back.

_TRIGGER_PULSE_US = 10

# Sound covers the distance twice (out and back): one-way distance is
# time × speed / 2. The speed rises with the air's temperature.
_UNITS = {
	"cm": 100,        # per metre
	"mm": 1000,
	"in": 39.3701,
}


def speed_of_sound(celsius: float) -> float:
	# m/s, dry air.
	return 331.3 + 0.606 * celsius


def echo_us(trigger: int, echo: int, timeout_ms: float) -> "int | None":
	# How long Echo stayed HIGH, in microseconds — None when no echo came back
	# within the timeout (nothing in range, or the sensor isn't wired).
	#
	# Pins are set up per run, not kept: one action instance serves every node
	# of this action, each with its own pins.
	echo_pin = Pin(echo, Pin.IN)
	trigger_pin = Pin(trigger, Pin.OUT)

	trigger_pin.value(0)
	time.sleep_us(2)
	trigger_pin.value(1)
	time.sleep_us(_TRIGGER_PULSE_US)
	trigger_pin.value(0)

	# Waits for Echo to go HIGH, then times how long it stays HIGH; negative on a timeout.
	duration = time_pulse_us(echo_pin, 1, int(timeout_ms * 1000))
	return duration if duration >= 0 else None


def is_unit(unit: str) -> bool:
	return unit in _UNITS


def distance(duration_us: int, unit: str, celsius: float) -> float:
	# The one-way distance `duration_us` of echo stands for, in `unit` ("cm" | "mm" | "in").
	metres = duration_us / 1000000 * speed_of_sound(celsius) / 2
	return metres * _UNITS[unit]


def text(value, default: str) -> str:
	# An options config arrives as bytes (its value's text).
	return str(value) if value is not None else default
