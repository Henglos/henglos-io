import json

from henglosio.sdk import HIOTrigger, trigger

from . import server
from .http import PathError, pick, publish_value, text


# HTTP / Request Trigger — runs its branch when a request comes in on Port,
# for Method and Path: a webhook, a button on a page, another board. The
# branch reads what came (method, path, query, the body in `file`, Pick's
# `value`) and answers with Respond; a branch that ends without answering
# answers 200 on its own. Another path gets 404, another method 405, a
# request without Auth's header 401 — all without running anything.
#
# Needs a network: WiFi's Connect (or Access Point) on Start. Until there's
# one it keeps trying to open the port.
#
# Wire ids:
#   ACTION_ID  "http/request trigger"
#   configs    "request trigger/port" (integer), "request trigger/method",
#              "request trigger/path", "request trigger/pick", "request trigger/save to"
#              (string/options -> str), "request trigger/auth" (credential -> its file's path)
#   outputs    "method", "path", "subpath", "file", "client", "error" (text), "size" (int),
#              "segments" (list of text),
#              "query" (object), "value" (any)


def _fnv(value: str) -> int:
	result = 0x811C9DC5
	for byte in value.encode():
		result = ((result ^ byte) * 0x01000193) & 0xFFFFFFFF
	return result


@trigger("http/request trigger")
class RequestTrigger(HIOTrigger):

	def initialize(self) -> None:
		self.route = None
		self.request = None

	def arm(self, context) -> None:
		port = context.get("request trigger/port")
		self.port = int(port) if isinstance(port, (int, float)) and 0 < port < 65536 else 80
		self.method = text(context.get("request trigger/method"), "ANY").upper() or "ANY"
		self.path = server.clean_path(context.get("request trigger/path"))
		self.pick = text(context.get("request trigger/pick")).strip()
		self.save_to = text(context.get("request trigger/save to")).strip()
		self.auth = server.auth_header(text(context.get("request trigger/auth")))
		self.body_path = self.save_to or "%s/in_%08x.body" % (server.BODY_DIR, _fnv(self.method + " " + self.path))

	def poll(self, context) -> bool:
		if self.route is None:
			if not server.network_up():
				return False            # no network yet — next poll asks again
			try:
				self.route = server.open_route(self.port, self.method, self.path, self.auth)
			except OSError:
				return False        # no network yet — next poll tries again

		server.take(self.port)
		if not self.route.waiting:
			return False

		request = self.route.waiting.pop(0)
		self.request = request
		server.current = request

		context.set("method", request.method)
		context.set("path", request.path)
		# Under the base path: what's after it, and its segments — /api/led/on
		# on base /api is "/led/on", ["led", "on"].
		context.set("subpath", request.subpath)
		context.set("segments", [segment for segment in request.subpath.split("/") if segment])
		context.set("query", request.query)
		context.set("client", request.address[0] if request.address else "")

		error = ""
		try:
			size = server.save_body(request, self.body_path)
		except OSError as failure:
			size = 0
			error = "body: " + str(failure)
		context.set("size", size)
		context.set("file", self.body_path if size else "")

		if not self.pick:
			context.set("value", "")
		elif not size:
			context.set("value", "")
			error = error or "pick: no body"
		else:
			try:
				with open(self.body_path) as source:
					error = publish_value(context, pick(json.load(source), self.pick)) or error
			except PathError as missing:
				context.set("value", "")
				error = error or "pick: " + str(missing)
			except (ValueError, OSError):
				context.set("value", "")
				error = error or "pick: not JSON"

		context.set("error", error)
		return True

	def finish(self, context) -> None:
		# Its branch is over: a request nobody answered gets 200.
		request = self.request
		self.request = None
		if request is not None and not request.answered:
			request.respond(200)
		if server.current is request:
			server.current = None

	def disarm(self) -> None:
		if self.request is not None:
			self.request.close()
			self.request = None
		if self.route is not None:
			server.close_route(self.port, self.route)
			self.route = None
