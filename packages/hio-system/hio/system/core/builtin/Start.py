# The built-in Start ("core/start"): the program's entry. No action class
# behind it — it steers the flow itself (mode, ONCE gating, variables' initial
# values), so ExecuteCommand runs it; what's here is what it reads.

from henglosio.sdk.core.identifier import generate_id

ACTION_ID = generate_id("core/start")
MODE_ID = generate_id("start/mode")
# A session begins (the studio's Play, Debug, ▶): the variables start over
# from their initial values — a Start without it (its loops) keeps what the
# program wrote.
FRESH_ID = generate_id("start/fresh")


def fresh(configs) -> bool:
	# Whether this Start begins a session: its "start/fresh" flag, set.
	for config in configs:
		if config.config_id == FRESH_ID:
			return len(config.data) > 0 and config.data[0] != 0
	return False


class FlowMode:
	# How the stored program runs Start's branch: over and over (LOOP), or a
	# single time (ONCE). UNKNOWN until its Start says.
	UNKNOWN = 0
	LOOP = 1
	ONCE = 2


def mode(configs) -> "int | None":
	# The "start/mode" config: "once" or "loop". None when absent (mode unchanged).
	for config in configs:
		if config.config_id == MODE_ID:
			value = bytes(config.data[:4])
			if value == b"once":
				return FlowMode.ONCE
			if value == b"loop":
				return FlowMode.LOOP
			return FlowMode.UNKNOWN
	return None
