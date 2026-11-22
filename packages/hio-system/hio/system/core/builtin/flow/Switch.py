from henglosio.sdk.core.identifier import generate_id
from . import operators

ACTION_ID = generate_id("logic/switch")

# Case 1…N (n8n style), each its own condition — "Case N value", "Case N
# operation" ("<type>:<operation>", see operators.py) and "Case N compare to"
# — and the output it goes out on. As many as the node has (the studio adds
# them: SwitchCases.ts); one it wasn't sent never matches.
_MAX_CASES = 16
_CASES = tuple(
	(
		generate_id("switch/case %d value" % n),
		generate_id("switch/case %d operation" % n),
		generate_id("switch/case %d compare to" % n),
		generate_id("case_%d" % n),
	)
	for n in range(1, _MAX_CASES + 1)
)
_OTHERWISE = generate_id("otherwise")

CONFIG_IDS = tuple(config_id for case in _CASES for config_id in case[:3])


def evaluate(read, instance_id: int, repeats: dict, sequence: bool):
	# The first case whose condition holds; one without an operation (not
	# sent: the node doesn't have it) never does.
	for value_id, operation_id, compare_id, output_id in _CASES:
		operation = read(operation_id)
		if not isinstance(operation, str) or not operation:
			continue
		if operators.evaluate(operation, read(value_id), read(compare_id)):
			return output_id, None
	return _OTHERWISE, None
