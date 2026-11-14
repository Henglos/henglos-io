import json
import os

from henglosio.sdk import HIOAction, action, SUCCESS

from .fs import FsError, checked, fail, real, stat


# Filesystem / List — what's in a folder: each entry's name, size and whether
# it's a folder — sorted by name, as many as fit a value (`count` is all of
# them). Fallback when the folder isn't there.
#
# Wire ids:
#   ACTION_ID  "filesystem/list"
#   configs    "list/folder" (string -> str)
#   outputs    "entries" (list of { name, size, folder }), "count" (int), "error" (text)

_MAX_LIST_BYTES = 400


@action("filesystem/list")
class ListAction(HIOAction):

	async def execute(self, context):

		try:
			folder = checked(context.get("list/folder") or b"/")
		except FsError as error:
			return fail(context, str(error), entries=[], count=0)

		found = stat(folder)
		if found is None or not found[0]:
			return fail(context, "no_folder", entries=[], count=0)

		try:
			names = sorted(os.listdir(real(folder)))
		except OSError as error:
			return fail(context, "failed: " + str(error), entries=[], count=0)

		entries = []
		base = "" if folder == "/" else folder
		for name in names:
			is_folder, size = stat(base + "/" + name) or (False, 0)
			entry = {"name": name, "size": 0 if is_folder else size, "folder": is_folder}
			if len(json.dumps(entries + [entry])) > _MAX_LIST_BYTES:
				break
			entries.append(entry)

		context.set("entries", entries)
		context.set("count", len(names))
		context.set("error", "")
		return SUCCESS
