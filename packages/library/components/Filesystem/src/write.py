from henglosio.sdk import HIOAction, action, SUCCESS

from .fs import FsError, checked, fail, folders, real, stat, text


# Filesystem / Write — puts Content in a file: over what was there, or added
# at its end (Mode). Its folders are made. Fallback for a path the board
# relies on (the runtime, components, credentials) or one it can't write.
#
# Wire ids:
#   ACTION_ID  "filesystem/write"
#   configs    "write/file", "write/content", "write/mode" (string/options -> str)
#   outputs    "file", "error" (text), "size" (int — the file's, after writing)


@action("filesystem/write")
class WriteAction(HIOAction):

	async def execute(self, context):

		try:
			path = checked(context.get("write/file"), write=True)
		except FsError as error:
			return fail(context, str(error), file="", size=0)

		found = stat(path)
		if found is not None and found[0]:
			return fail(context, "is_folder", file="", size=0)

		content = context.get("write/content")
		data = bytes(content) if isinstance(content, (bytes, bytearray)) else text(content).encode()
		mode = "ab" if text(context.get("write/mode"), "overwrite") == "append" else "wb"

		try:
			folders(path)
			with open(real(path), mode) as file:
				file.write(data)
		except OSError as error:
			return fail(context, "failed: " + str(error), file="", size=0)

		context.set("file", path)
		context.set("size", stat(path)[1])
		context.set("error", "")
		return SUCCESS
