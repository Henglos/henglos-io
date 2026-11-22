# The built-in components. They ship with the runtime (frozen in), so they're
# always there: no package to install, nothing for the driver to send.
#
# variables: ordinary HIOAction classes — importing this registers them, like
# ComponentLoader does an installed component's.
#
# Start and flow (If, Switch, Repeat): they steer the flow itself, so
# ExecuteCommand runs them — no action class, not in the registry.

from . import variables
from . import Start
from . import flow

# Actions ExecuteCommand handles itself, with no action class behind them.
FLOW_ACTION_IDS = (Start.ACTION_ID,) + tuple(flow.ACTIONS)
