from machine import Pin, PWM


# What the Servo actions share: one PWM per pin, created on first use and
# kept — the way any MicroPython script keeps its PWM object. The actions
# import it as `from .driver import ...`.
#
# Kept, not recreated each run: a second PWM on a pin that already has one
# fails on MicroPython's ESP32 port ("RuntimeError: PWM is inactive"), and
# recreating the signal would make the servo jitter anyway.

FREQ = 50

_pwms = {}


def pwm_on(pin: int) -> PWM:
	# The servo signal of `pin`. A new one starts at duty 0 — no pulse until
	# an action sets one, so the servo doesn't twitch when it's created.
	pwm = _pwms.get(pin)
	if pwm is None:
		pwm = PWM(Pin(pin), freq=FREQ, duty_u16=0)
		_pwms[pin] = pwm
	return pwm


def release(pin: int) -> None:
	# Stops `pin`'s signal and frees the pin. No signal: nothing to do.
	pwm = _pwms.pop(pin, None)
	if pwm is not None:
		pwm.deinit()
