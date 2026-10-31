from hio.sdk import HIOAction, action, SUCCESS

from .fs import CONTENT_BYTES, FsError, as_text, checked, fail, real, stat


# Filesystem / Read — a file's text: all of it when it fits a value, else a
# slice — Offset and Length pick which, `end` says whether it's the last.
# Fallback when it isn't there, is a folder, or can't be read.
#
# Wire ids:
#   ACTION_ID  "filesystem/read"
#   configs    "read/file" (string -> text), "read/offset", "read/length" (number -> FLOAT_32)
#   outputs    "content", "error" (text), "size", "read" (int), "end" (bool)


@action("filesystem/read")
class ReadAction(HIOAction):

	async def execute(self, context):

		empty = {"content": "", "size": 0, "read": 0, "end": True}
		try:
			path = checked(context.get("read/file"))
		except FsError as error:
			return fail(context, str(error), **empty)

		found = stat(path)
		if found is None:
			return fail(context, "no_file", **empty)
		if found[0]:
			return fail(context, "is_folder", **empty)
		size = found[1]

		offset = max(0, int(context.get("read/offset") or 0))
		length = int(context.get("read/length") or 0)
		length = CONTENT_BYTES if length <= 0 else min(length, CONTENT_BYTES)

		try:
			with open(real(path), "rb") as file:
				file.seek(offset)
				data = file.read(length)
		except OSError as error:
			return fail(context, "failed: " + str(error), **empty)

		content = as_text(data)
		context.set("content", content)
		context.set("size", size)
		context.set("read", len(data))
		context.set("end", offset + len(data) >= size)
		context.set("error", "")
		return SUCCESS
