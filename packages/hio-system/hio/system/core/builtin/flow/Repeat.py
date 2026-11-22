from henglosio.sdk.core.identifier import generate_id
from ... import Logic
from ...Context import encode_value

ACTION_ID = generate_id("logic/repeat")

_TIMES_ID = generate_id("repeat/times")
_ITERATION_ID = generate_id("iteration")
_LOOP = generate_id("loop")
_DONE = generate_id("done")

CONFIG_IDS = (_TIMES_ID,)


def evaluate(read, instance_id: int, repeats: dict, sequence: bool):
	# Loop `times` times — publishing which time round it is — then Done,
	# back to zero for the next time the flow gets here. `repeats`: the
	# branch's count by INSTANCE_ID. A RUN (outside the flow, `sequence`
	# False) only says what the next step would be: nothing counted.
	times = Logic.number(read(_TIMES_ID))
	times = 0 if times is None else int(times)

	count = repeats.get(instance_id, 0) + 1
	if count > times:
		if sequence:
			repeats.pop(instance_id, None)
		return _DONE, None

	if sequence:
		repeats[instance_id] = count
	return _LOOP, [encode_value(_ITERATION_ID, count)]
