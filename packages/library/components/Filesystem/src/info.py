from henglosio.sdk import HIOAction, action

from .fs import FsError, checked, stat


# Filesystem / Info — whether a path is there, and what: branches Exists or
# Missing, with whether it's a folder and its size.
#
# Wire ids:
#   ACTION_ID  "filesystem/info"
#   configs    "info/path" (string -> str)
#   outputs    "exists", "folder" (bool), "size" (int)
#   goes out   "exists" | "missing"


@action("filesystem/info")
class InfoAction(HIOAction):

	async def execute(self, context):

		try:
			found = stat(checked(context.get("info/path")))
		except FsError:
			found = None

		context.set("exists", found is not None)
		context.set("folder", bool(found and found[0]))
		context.set("size", found[1] if found and not found[0] else 0)
		return "exists" if found is not None else "missing"
