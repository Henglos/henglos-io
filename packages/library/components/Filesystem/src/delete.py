import os

from hio.sdk import HIOAction, action, SUCCESS

from .fs import FsError, checked, fail, real, stat


# Filesystem / Delete — removes a file, or a folder: an empty one, or with
# everything in it when Recursive is on. Fallback when nothing's there, the
# folder isn't empty (Recursive off), or the board relies on it.
#
# Wire ids:
#   ACTION_ID  "filesystem/delete"
#   configs    "delete/path" (string -> str), "delete/recursive" (toggle -> BOOL)
#   outputs    "error" (text)


def _remove_tree(path: str) -> None:
	for name in os.listdir(real(path)):
		child = path + "/" + name
		if stat(child)[0]:
			_remove_tree(child)
		else:
			os.remove(real(child))
	os.rmdir(real(path))


@action("filesystem/delete")
class DeleteAction(HIOAction):

	async def execute(self, context):

		try:
			path = checked(context.get("delete/path"), write=True)
		except FsError as error:
			return fail(context, str(error))

		found = stat(path)
		if found is None:
			return fail(context, "no_file")

		try:
			if not found[0]:
				os.remove(real(path))
			elif context.get("delete/recursive"):
				_remove_tree(path)
			elif os.listdir(real(path)):
				return fail(context, "not_empty")
			else:
				os.rmdir(real(path))
		except OSError as error:
			return fail(context, "failed: " + str(error))

		context.set("error", "")
		return SUCCESS
