import json
import socket
import sys

from .http import text


# What the Request Trigger and Respond share: the board's listening sockets
# (one per port, every Request Trigger on it routed by Method/Path) and the
# request whose branch is running — the one Respond answers.
#
# Nothing runs in the background: a Request Trigger's poll() takes in what
# waits on its port (accept never blocks), reads the request and decides
# whose it is. A request that comes while a branch runs waits in the port's
# backlog — or, read already, in the route it belongs to.

# Where a request's body goes — the same temporary folder as Request's
# answers (cleared when a session starts).
BODY_DIR = "/tmp/http"

_HEAD_BYTES = 2048          # request line + headers, at most
_CHUNK = 512
_READ_TIMEOUT_S = 3         # a client that sends its request slower than this is dropped
_BACKLOG = 2

_REASONS = {
	200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
	400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
	405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Entity",
	500: "Internal Server Error", 503: "Service Unavailable",
}


class Request:
	# One request read off a client: what it asked, and the client to answer.

	def __init__(self, client, address, method: str, target: str, headers: dict) -> None:
		self.client = client
		self.address = address
		self.method = method
		path, _, query = target.partition("?")
		self.path = path or "/"
		self.query = _query(query)
		self.headers = headers              # lowercased names
		self.rest = b""                     # body bytes read along with the head
		self.file = ""                      # where the body went
		self.size = 0
		self.answered = False
		self.subpath = ""                   # what comes after its route's base path — "/led/on"

	def respond(self, status: int, body: bytes = b"", content_type: str = "text/plain", file: str = "") -> None:
		# Answers and closes — the body from `body`, or streamed from `file`.
		if self.answered:
			return
		self.answered = True
		try:
			size = len(body)
			if file:
				import os
				size = os.stat(file)[6]
			head = "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % (
				status, _REASONS.get(status, "Status"), content_type, size)
			_send_all(self.client, head.encode())
			if file:
				with open(file, "rb") as source:
					while True:
						chunk = source.read(_CHUNK)
						if not chunk:
							break
						_send_all(self.client, chunk)
			elif body:
				_send_all(self.client, body)
		except OSError:
			pass
		finally:
			self.close()

	def close(self) -> None:
		try:
			self.client.close()
		except OSError:
			pass


class Route:
	# One Request Trigger's place on a port: what it answers to, and the
	# requests read for it that wait their turn.

	def __init__(self, method: str, path: str, auth) -> None:
		self.method = method                # "ANY" or one method
		self.path = path
		self.auth = auth                    # (header, value) or None
		self.waiting = []                   # Request — read, its branch not run yet

	def matches_path(self, request: Request) -> bool:
		# A base path: itself and everything under it, by whole segments —
		# /api takes /api, /api/ and /api/led/on, not /apix. "/" takes all.
		if self.path == "/":
			return True
		return request.path == self.path or request.path.startswith(self.path + "/")

	def subpath(self, request: Request) -> str:
		# What comes after the base path — "" for the base itself.
		rest = request.path if self.path == "/" else request.path[len(self.path):]
		return "" if rest in ("", "/") else rest

	def matches_method(self, request: Request) -> bool:
		return self.method == "ANY" or request.method == self.method

	def allows(self, request: Request) -> bool:
		if self.auth is None:
			return True
		return request.headers.get(self.auth[0].lower()) == self.auth[1]


class Listener:
	# A listening socket on one port and the routes on it.

	def __init__(self, port: int) -> None:
		self.port = port
		self.routes = []
		address = socket.getaddrinfo("0.0.0.0", port)[0][-1]
		self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
		self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
		self.socket.bind(address)
		self.socket.listen(_BACKLOG)
		self.socket.setblocking(False)

	def take(self) -> None:
		# Every client waiting on the port: read, then handed to its route —
		# or answered right away (404, 405, 401, 400).
		while True:
			try:
				client, address = self.socket.accept()
			except OSError:
				return              # nobody waiting (EAGAIN)
			request = _read(client, address)
			if request is None:
				_close(client)
				continue
			self._route(request)

	def _route(self, request: Request) -> None:
		# The most specific base path first: /api/led before /api, before "/".
		on_path = sorted((route for route in self.routes if route.matches_path(request)), key=lambda route: len(route.path), reverse=True)
		if not on_path:
			request.respond(404, b"not found")
			return
		for route in on_path:
			if route.matches_method(request):
				if not route.allows(request):
					request.respond(401, b"unauthorized")
					return
				request.subpath = route.subpath(request)
				route.waiting.append(request)
				return
		request.respond(405, b"method not allowed")

	def close(self) -> None:
		for route in self.routes:
			for request in route.waiting:
				request.close()
			route.waiting = []
		_close(self.socket)


# port -> Listener. Kept in sys.modules, not in this module: a session
# stops main.py with Ctrl-C (no reset) and imports /components afresh, while
# the stored program's sockets stay open — the port taken, a new bind refused
# (EADDRINUSE), the session's Request Trigger never firing. So the sockets the
# last run left are found here, and closed, as this module loads: that run is over.
_HELD = "__hio_http_listeners__"
_listeners = sys.modules.get(_HELD)
if _listeners is None:
	_listeners = {}
	sys.modules[_HELD] = _listeners
for _stale in list(_listeners.values()):
	try:
		_stale.close()
	except Exception:
		pass
_listeners.clear()

# The request whose branch is running — Respond's to answer; answered on its
# own (200) when the branch ends without one (RequestTrigger.finish).
current = None


def network_up() -> bool:
	# Whether the board is on a network (the station connected, or its access
	# point on). A socket made before that may bring an ESP32 down — the
	# stored program polls its triggers before Start's WiFi Connect ran.
	try:
		import network
	except ImportError:
		return True                     # not a board (the tests)
	try:
		if network.WLAN(network.STA_IF).isconnected():
			return True
		return network.WLAN(network.AP_IF).active()
	except (OSError, AttributeError):
		return False


def open_route(port: int, method: str, path: str, auth) -> Route:
	listener = _listeners.get(port)
	if listener is None:
		listener = Listener(port)
		_listeners[port] = listener
	route = Route(method, path, auth)
	listener.routes.append(route)
	return route


def close_route(port: int, route: Route) -> None:
	listener = _listeners.get(port)
	if listener is None:
		return
	if route in listener.routes:
		listener.routes.remove(route)
	for request in route.waiting:
		request.close()
	route.waiting = []
	if not listener.routes:
		listener.close()
		del _listeners[port]


def take(port: int) -> None:
	listener = _listeners.get(port)
	if listener is not None:
		listener.take()


# --- reading a request

def _read(client, address) -> "Request | None":
	# The request line and headers; the body stays on the socket (save_body).
	try:
		client.settimeout(_READ_TIMEOUT_S)
		data = b""
		while b"\r\n\r\n" not in data:
			chunk = client.recv(256)
			if not chunk:
				return None
			data += chunk
			if len(data) > _HEAD_BYTES:
				_answer(client, 431, b"headers too large")
				return None
	except OSError:
		return None

	head, _, rest = data.partition(b"\r\n\r\n")
	lines = head.decode().split("\r\n")
	parts = lines[0].split(" ")
	if len(parts) < 2:
		_answer(client, 400, b"bad request")
		return None

	headers = {}
	for line in lines[1:]:
		name, _, value = line.partition(":")
		headers[name.strip().lower()] = value.strip()

	request = Request(client, address, parts[0].upper(), parts[1], headers)
	request.rest = rest
	return request


def save_body(request: Request, path: str) -> int:
	# Streams the body (Content-Length bytes) to `path` — its size; 0 when
	# there's none (nothing is written then).
	try:
		length = int(request.headers.get("content-length", "0"))
	except ValueError:
		length = 0
	if length <= 0:
		return 0

	_folders(path)
	size = 0
	with open(path, "wb") as file:
		first = request.rest[:length]
		file.write(first)
		size = len(first)
		while size < length:
			chunk = request.client.recv(min(_CHUNK, length - size))
			if not chunk:
				break
			file.write(chunk)
			size += len(chunk)
	request.file = path
	request.size = size
	return size


def _query(query: str) -> dict:
	values = {}
	for pair in query.split("&") if query else ():
		name, _, value = pair.partition("=")
		if name:
			values[_unquote(name)] = _unquote(value)
	return values


def _unquote(value: str) -> str:
	value = value.replace("+", " ")
	if "%" not in value:
		return value
	out = bytearray()
	index = 0
	raw = value.encode()
	while index < len(raw):
		if raw[index] == 0x25 and index + 2 < len(raw):
			try:
				out.append(int(raw[index + 1:index + 3], 16))
				index += 3
				continue
			except ValueError:
				pass
		out.append(raw[index])
		index += 1
	return bytes(out).decode()


def _folders(path: str) -> None:
	import os
	current = ""
	for part in path.split("/")[1:-1]:
		current += "/" + part
		try:
			os.mkdir(current)
		except OSError:
			pass


def _send_all(client, data: bytes) -> None:
	view = memoryview(data)
	while view:
		sent = client.send(view)
		view = view[sent:]


def _answer(client, status: int, body: bytes) -> None:
	try:
		_send_all(client, ("HTTP/1.1 %d %s\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % (
			status, _REASONS.get(status, "Status"), len(body))).encode() + body)
	except OSError:
		pass


def _close(sock) -> None:
	try:
		sock.close()
	except OSError:
		pass


def auth_header(path: str):
	# An HTTP Header Auth credential's (header, value) — None without one.
	if not path:
		return None
	try:
		with open(path) as file:
			values = json.load(file)
	except (OSError, ValueError):
		return None
	value = values.get("value") or ""
	return ((values.get("header") or "Authorization"), value) if value else None


def clean_path(value) -> str:
	# A base path as routes compare it: one leading "/", none at the end ("/api/" is "/api").
	path = text(value, "/").strip().rstrip("/")
	return "/" + path.lstrip("/") if path else "/"
