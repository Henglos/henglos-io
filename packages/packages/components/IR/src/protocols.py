# The IR protocols, each as its timings — what the actions speak is
# (protocol, address, command); a protocol turns that into the marks and
# spaces of light the LED sends (encode), and those back into it (decode).
# A new protocol is a new entry in PROTOCOLS — the actions don't change.
#
# Timings are in µs, a list that starts with a mark (the LED lit, at the
# carrier frequency) and alternates mark, space, mark… — what a receiver
# module sees, inverted (its output is low during a mark).
#
# Both are pulse-distance: every bit is a 560 µs mark, then a short space
# (0) or a long one (1), least significant bit first, after a leader.

_BIT_MARK = 560
_ZERO_SPACE = 560
_ONE_SPACE = 1690

# How far a received timing may be from the nominal one and still count:
# the receiver module stretches marks and shortens spaces by ~100 µs.
_TOLERANCE = 0.35


def near(value: int, nominal: int) -> bool:
	return abs(value - nominal) <= nominal * _TOLERANCE + 100


def _bits(value: int, count: int):
	timings = []
	for i in range(count):
		timings.append(_BIT_MARK)
		timings.append(_ONE_SPACE if (value >> i) & 1 else _ZERO_SPACE)
	return timings


def _read_bits(timings, start: int, count: int):
	# `count` bits from timings[start] on — None when they aren't pulse-distance bits.
	value = 0
	for i in range(count):
		at = start + 2 * i
		if at + 1 >= len(timings) or not near(timings[at], _BIT_MARK):
			return None
		space = timings[at + 1]
		if near(space, _ONE_SPACE):
			value |= 1 << i
		elif not near(space, _ZERO_SPACE):
			return None
	return value


# ── NEC ──────────────────────────────────────────────────────────────────────
# 9 ms mark, 4.5 ms space, then address, ~address, command, ~command. Extended
# NEC: a 16-bit address (no inverse) — sent when the address doesn't fit 8 bits.
# A held button repeats as 9 ms, 2.25 ms, a mark — every 108 ms.

NEC_PERIOD_MS = 108


def nec_encode(address: int, command: int):
	address &= 0xFFFF
	command &= 0xFF
	if address <= 0xFF:
		address |= (address ^ 0xFF) << 8
	return [9000, 4500] + _bits(address | (command << 16) | ((command ^ 0xFF) << 24), 32) + [_BIT_MARK]


def nec_repeat():
	return [9000, 2250, _BIT_MARK]


def nec_decode(timings):
	# (address, command, repeat) — None when it isn't NEC.
	if len(timings) < 3 or not near(timings[0], 9000):
		return None
	if near(timings[1], 2250):
		return (None, None, True)
	if not near(timings[1], 4500):
		return None
	value = _read_bits(timings, 2, 32)
	if value is None:
		return None
	low, high = value & 0xFF, (value >> 8) & 0xFF
	command, check = (value >> 16) & 0xFF, (value >> 24) & 0xFF
	if command ^ check != 0xFF:
		return None
	address = low if low ^ high == 0xFF else low | (high << 8)
	return (address, command, False)


# ── Samsung ──────────────────────────────────────────────────────────────────
# 4.5 ms mark, 4.5 ms space, then address twice, command, ~command (TVs and
# their remotes). A held button sends the whole frame again.

SAMSUNG_PERIOD_MS = 108


def samsung_encode(address: int, command: int):
	address &= 0xFF
	command &= 0xFF
	return [4500, 4500] + _bits(address | (address << 8) | (command << 16) | ((command ^ 0xFF) << 24), 32) + [_BIT_MARK]


def samsung_decode(timings):
	if len(timings) < 66 or not near(timings[0], 4500) or not near(timings[1], 4500):
		return None
	value = _read_bits(timings, 2, 32)
	if value is None:
		return None
	command, check = (value >> 16) & 0xFF, (value >> 24) & 0xFF
	if command ^ check != 0xFF:
		return None
	return (value & 0xFF, command, False)


# Protocol -> (encode, decode, the frame's period in ms, its held-button repeat:
# a frame of its own, or None to send the whole frame again).
PROTOCOLS = {
	"nec": (nec_encode, nec_decode, NEC_PERIOD_MS, nec_repeat),
	"samsung": (samsung_encode, samsung_decode, SAMSUNG_PERIOD_MS, None),
}


def decode(timings):
	# (protocol, address, command, repeat) of what was received — None when no protocol knows it.
	for name, (_, decoder, _, _) in PROTOCOLS.items():
		found = decoder(timings)
		if found is not None:
			return (name,) + found
	return None
