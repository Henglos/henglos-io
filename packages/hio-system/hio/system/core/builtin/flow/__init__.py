# The built-in Flow component (LogicComponent.ts): If, Switch and Repeat.
# Not HIOAction classes — they only steer the flow, so ExecuteCommand runs
# them. Each module has its ACTION_ID, the CONFIG_IDS it reads (dropped from
# the pipeline before it runs, so one it wasn't sent — an empty case — can't
# be another node's leftover) and evaluate(read, instance_id, repeats,
# sequence) -> (output_id, results).

from . import If, Switch, Repeat

ACTIONS = {
	If.ACTION_ID: If,
	Switch.ACTION_ID: Switch,
	Repeat.ACTION_ID: Repeat,
}
