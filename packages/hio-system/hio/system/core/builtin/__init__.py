# The built-in components whose actions are ordinary HIOAction classes —
# importing this registers them, like ComponentLoader does an installed
# component's. They ship with the runtime (frozen in), so they're always
# there: no package to install, nothing for the driver to send.
#
# Start and Logic (If, Switch, Repeat) aren't here: they steer the flow
# itself, so ExecuteCommand handles them.

from . import variables
