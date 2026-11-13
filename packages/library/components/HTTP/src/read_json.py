import json

from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .http import PathError, pick, publish_value, text


# HTTP / Read JSON — one value out of a JSON file on the board: what Request
# saved (Save To), or any other. Fallback when the file isn't there, isn't
# JSON, has nothing at Pick, or the value doesn't fit.
#
# Wire ids:
#   ACTION_ID  "http/read json"
#   configs    "read json/file", "read json/pick" (string -> str)
#   outputs    "value" (any), "error" (text)


@action("http/read json")
class ReadJsonAction(HIOAction):

	async def execute(self, context):

		path = text(context.get("read json/file")).strip()
		where = text(context.get("read json/pick")).strip()

		try:
			with open(path) as file:
				document = json.load(file)
		except OSError:
			context.set("value", "")
			context.set("error", "no_file")
			return FALLBACK
		except ValueError:
			context.set("value", "")
			context.set("error", "not_json")
			return FALLBACK

		try:
			error = publish_value(context, pick(document, where))
		except PathError as missing:
			context.set("value", "")
			error = str(missing)

		context.set("error", error)
		return FALLBACK if error else SUCCESS
