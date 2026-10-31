import os

from hio.sdk import HIOAction, action, SUCCESS

from .fs import FsError, checked, fail, folders, real, stat


# Filesystem / Move — renames a file or folder, or moves it to another one
# (the destination's folders are made). Fallback when there's nothing to
# move, something's already at To, or either path is one the board relies on.
#
# Wire ids:
#   ACTION_ID  "filesystem/move"
#   configs    "move/from", "move/to" (string -> text)
#   outputs    "file", "error" (text — `file` is the new path)


@action("filesystem/move")
class MoveAction(HIOAction):

	async def execute(self, context):

		try:
			source = checked(context.get("move/from"), write=True)
			target = checked(context.get("move/to"), write=True)
		except FsError as error:
			return fail(context, str(error), file="")

		if stat(source) is None:
			return fail(context, "no_file", file="")
		if stat(target) is not None:
			return fail(context, "exists", file="")

		try:
			folders(target)
			os.rename(real(source), real(target))
		except OSError as error:
			return fail(context, "failed: " + str(error), file="")

		context.set("file", target)
		context.set("error", "")
		return SUCCESS
