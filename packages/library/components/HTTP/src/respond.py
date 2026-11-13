import json

from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from . import server
from .http import clamp, text


# HTTP / Respond — answers the request a Request Trigger's branch is running
# for: Status, and a Body (text, or a list/object as JSON) or a File from the
# board. Fallback when there's no request to answer (not in a Request
# Trigger's branch, or it was answered already).
#
# Wire ids:
#   ACTION_ID  "http/respond"
#   configs    "respond/status" (integer), "respond/content type",
#              "respond/file" (string/options -> str), "respond/body" (any)
#   outputs    "error" (text)


def _payload(value, kind: str):
	# The body as bytes and its Content-Type (Auto: JSON for a list/object or
	# text that looks like it, plain text otherwise).
	if isinstance(value, (list, dict)):
		return json.dumps(value).encode(), "application/json" if kind == "auto" else kind
	if value is None:
		data = b""
	elif isinstance(value, (bytes, bytearray)):
		data = bytes(value)
	else:
		data = str(value).encode()
	if kind == "auto":
		kind = "application/json" if data.lstrip()[:1] in (b"{", b"[") else "text/plain"
	return data, kind


@action("http/respond")
class RespondAction(HIOAction):

	async def execute(self, context):

		# Its branch's request — branches run side by side (runtime 3.1+:
		# context.origin, the trigger that started it); before that, the one
		# branch running.
		origin = getattr(context, "origin", None)
		request = server.current if origin is None else getattr(origin, "request", None)
		if request is None or request.answered:
			context.set("error", "no_request")
			return FALLBACK

		status = int(clamp(context.get("respond/status") or 200, 100, 599))
		kind = text(context.get("respond/content type"), "auto") or "auto"
		file = text(context.get("respond/file")).strip()

		if file:
			try:
				open(file).close()
			except OSError:
				request.respond(500, b"no file")
				context.set("error", "no_file")
				return FALLBACK
			request.respond(status, content_type="application/octet-stream" if kind == "auto" else kind, file=file)
		else:
			body, content_type = _payload(context.get("respond/body"), kind)
			request.respond(status, body, content_type)

		context.set("error", "")
		return SUCCESS
