from henglosio.sdk import HIOAction, action, SUCCESS

from .fs import CHUNK, FsError, checked, fail, folders, real, stat


# Filesystem / Copy — a file to another path (its folders made), over what
# was there — e.g. a Request's temporary answer kept for good. Fallback when
# the source isn't a file, or the destination is one the board relies on.
#
# Wire ids:
#   ACTION_ID  "filesystem/copy"
#   configs    "copy/from", "copy/to" (string -> str)
#   outputs    "file", "error" (text — `file` is the copy's path), "size" (int)


@action("filesystem/copy")
class CopyAction(HIOAction):

	async def execute(self, context):

		try:
			source = checked(context.get("copy/from"))
			target = checked(context.get("copy/to"), write=True)
		except FsError as error:
			return fail(context, str(error), file="", size=0)

		found = stat(source)
		if found is None:
			return fail(context, "no_file", file="", size=0)
		if found[0]:
			return fail(context, "is_folder", file="", size=0)
		if source == target:
			return fail(context, "same_file", file="", size=0)

		try:
			folders(target)
			with open(real(source), "rb") as reader, open(real(target), "wb") as writer:
				while True:
					chunk = reader.read(CHUNK)
					if not chunk:
						break
					writer.write(chunk)
		except OSError as error:
			return fail(context, "failed: " + str(error), file="", size=0)

		context.set("file", target)
		context.set("size", found[1])
		context.set("error", "")
		return SUCCESS
