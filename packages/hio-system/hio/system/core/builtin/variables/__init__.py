# The built-in Variables component (VariablesComponent.ts in the workflow
# package): its actions read and write GlobalVariables, through what only the
# runtime's ActionContext offers — a "variable" config carries the
# VARIABLE_ID, not the name (see ActionContext.target).

from . import Set, Append, SetField, Clear, Remove
