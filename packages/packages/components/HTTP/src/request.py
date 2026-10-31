import gc
import json

from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .http import PathError, clamp, pick, publish_value, text


# HTTP / Request — calls a URL over the board's network (WiFi's Connect
# first). Out on a 2xx answer, Fallback otherwise — no network, the name didn't
# resolve, it took longer than Timeout, or the server answered 4xx/5xx.
#
# The body is streamed to a file — Save To, or a temporary one of its own
# (TEMP_DIR, cleared when a session starts) — and published as "file", its
# path: the next actions read it whole (Read JSON, Filesystem's Read, a Code
# binding). Pick takes one value out of it as JSON. The request blocks the
# board while it runs — Timeout bounds it.
#
# Wire ids:
#   ACTION_ID  "http/request"
#   configs    "request/method", "request/url", "request/content type", "request/save to",
#              "request/pick" (string/options -> text), "request/headers" (list of { name, value }),
#              "request/body" (any), "request/auth" (credential -> its file's path),
#              "request/timeout" (number -> FLOAT_32, ms)
#   outputs    "status", "size" (int), "file", "error" (text), "value" (any)
#   goes out   Success (Out) on a 2xx answer, Fallback otherwise

_TIMEOUT_MS = 10000
_CHUNK = 512
_NO_BODY = ("GET", "HEAD", "DELETE")

# Where a body goes without Save To — cleared when a session starts.
TEMP_DIR = "/tmp/http"


def _requests():
	# MicroPython's requests (urequests on older firmware) — None without it.
	try:
		import requests
		return requests
	except ImportError:
		pass
	try:
		import urequests
		return urequests
	except ImportError:
		return None


def _online() -> bool:
	# On a network, or running one (a server on the Access Point's side).
	try:
		import network
		return network.WLAN(network.STA_IF).isconnected() or network.WLAN(network.AP_IF).active()
	except (ImportError, OSError):
		return True


def _memory() -> str:
	# What was free when it ran out — Python's heap, and the chip's largest
	# block (where TLS takes its buffers): " (python 21 KB, chip block 9 KB)".
	# Never raises — it runs while reporting another error.
	gc.collect()
	notes = []
	try:
		notes.append("python %d KB" % (gc.mem_free() // 1024))
	except AttributeError:
		pass
	try:
		import esp32
		largest = max(heap[2] for heap in esp32.idf_heap_info(esp32.HEAP_DATA))
		notes.append("chip block %d KB" % (largest // 1024))
	except (ImportError, AttributeError, ValueError):
		pass
	return " (" + ", ".join(notes) + ")" if notes else ""


def _reason(error: OSError) -> str:
	# An OSError from the socket as a word.
	import errno
	code = error.args[0] if error.args else None
	if code in (-2, -3, -202):
		return "dns"
	# The TLS handshake's buffers come from the chip's own heap, not Python's —
	# a big certificate chain (google.com) doesn't fit next to the WiFi.
	if code in (12, getattr(errno, "ENOMEM", 12)) or "ENOMEM" in str(error):
		return "out_of_memory" + _memory()
	# The ESP32's numbers, and the port's own when they differ.
	if code in (110, 116, getattr(errno, "ETIMEDOUT", 110)) or "timed out" in str(error):
		return "timeout"
	if code in (104, 111, getattr(errno, "ECONNREFUSED", 111), getattr(errno, "ECONNRESET", 104)):
		return "refused"
	if code in (113, 118, getattr(errno, "EHOSTUNREACH", 113)):
		return "unreachable"
	return "failed: " + str(error)


def _auth(path: str):
	# The credential's header as (name, value) — None without one.
	if not path:
		return None
	try:
		with open(path) as file:
			values = json.load(file)
	except (OSError, ValueError):
		return None
	value = values.get("value") or ""
	return ((values.get("header") or "Authorization"), value) if value else None


def _headers(entries, auth) -> dict:
	headers = {}
	for entry in entries if isinstance(entries, list) else ():
		if isinstance(entry, dict) and entry.get("name"):
			headers[str(entry["name"])] = str(entry.get("value", ""))
	if auth is not None:
		headers[auth[0]] = auth[1]
	return headers


def _has(headers: dict, name: str) -> bool:
	name = name.lower()
	return any(key.lower() == name for key in headers)


def _body(value, kind: str, headers: dict):
	# The request body as bytes, and its Content-Type when none is set: a list
	# or an object as JSON, text as itself (JSON when it looks like it).
	if value is None:
		return None
	if isinstance(value, (list, dict)):
		data = json.dumps(value).encode()
		guess = "application/json"
	elif isinstance(value, (bytes, bytearray)):
		data = bytes(value)
		guess = "application/json" if data.lstrip()[:1] in (b"{", b"[") else "text/plain"
	else:
		data = str(value).encode()
		guess = "text/plain"
	if not data:
		return None
	if not _has(headers, "Content-Type"):
		headers["Content-Type"] = guess if kind in ("", "auto") else kind
	return data


def _folders(path: str) -> None:
	# The folders `path` sits in — made when missing.
	import os
	current = ""
	for part in path.split("/")[1:-1]:
		current += "/" + part
		try:
			os.mkdir(current)
		except OSError:
			pass


def _content_length(response):
	# The answer's Content-Length — None when the server didn't send one (or
	# requests didn't keep the headers).
	headers = getattr(response, "headers", None) or {}
	for name, value in headers.items():
		if str(name).lower() == "content-length":
			try:
				return int(value)
			except (TypeError, ValueError):
				return None
	return None


def _send(requests, method, url, data, headers, timeout_s):
	try:
		return requests.request(method, url, data=data, headers=headers, timeout=timeout_s)
	except TypeError:
		# A requests before timeouts — no Timeout then.
		return requests.request(method, url, data=data, headers=headers)


def _fnv(text: str) -> int:
	# A 32-bit FNV-1a hash — names a request's temporary file.
	value = 0x811C9DC5
	for byte in text.encode():
		value = ((value ^ byte) * 0x01000193) & 0xFFFFFFFF
	return value


def _temp_path(method: str, url: str) -> str:
	# The body's file without Save To: one per method + URL, so the same
	# request run again (a loop) overwrites it instead of piling files up.
	return "%s/%08x.body" % (TEMP_DIR, _fnv(method + " " + url))


def _clear_temp() -> None:
	# The temporary bodies of the session before — this module loads once per
	# session (and on boot, for the stored program): what's in TEMP_DIR is gone
	# with it. Save To files are the workflow's own and stay.
	import os
	try:
		names = os.listdir(TEMP_DIR)
	except OSError:
		return
	for name in names:
		try:
			os.remove(TEMP_DIR + "/" + name)
		except OSError:
			pass


_clear_temp()


def _fail(context, reason: str, status: int = 0) -> str:
	context.set("status", status)
	context.set("size", 0)
	context.set("file", "")
	context.set("value", "")
	context.set("error", reason)
	return FALLBACK


@action("http/request")
class RequestAction(HIOAction):

	async def execute(self, context):
		# Anything unexpected — out of memory in the TLS handshake, the most
		# likely — is an Error saying what, not a Fallback without a word.
		try:
			return self._request(context)
		except MemoryError:
			return _fail(context, "out_of_memory" + _memory())
		except Exception as error:
			return _fail(context, "failed: %r" % (error,))

	def _request(self, context):

		method = text(context.get("request/method"), "GET").upper()
		url = text(context.get("request/url")).strip()
		kind = text(context.get("request/content type"), "auto")
		save_to = text(context.get("request/save to")).strip()
		path = text(context.get("request/pick")).strip()
		timeout = clamp(context.get("request/timeout") or _TIMEOUT_MS, 1000, 60000)

		if not url:
			return _fail(context, "no_url")
		if "://" not in url:
			url = "http://" + url

		requests = _requests()
		if requests is None:
			return _fail(context, "no_requests_module")
		if not _online():
			return _fail(context, "no_network")

		headers = _headers(context.get("request/headers"), _auth(text(context.get("request/auth"))))
		data = None if method in _NO_BODY else _body(context.get("request/body"), kind, headers)

		# A TLS handshake takes ~40 KB in one go — free what's free first.
		gc.collect()
		try:
			response = _send(requests, method, url, data, headers, timeout / 1000)
		except OSError as error:
			return _fail(context, _reason(error))
		except (ValueError, NotImplementedError) as error:
			# A bad URL, or an answer requests doesn't read (chunked, a redirect loop).
			return _fail(context, "failed: " + str(error))

		status = response.status_code
		size = 0
		length = _content_length(response)
		# Where the body goes: Save To, or this request's own temporary file.
		target = "" if method == "HEAD" else (save_to or _temp_path(method, url))
		file = None

		try:
			if target:
				_folders(target)
				file = open(target, "wb")
			while file is not None:
				# Exactly Content-Length bytes when the server says how many: the
				# read past the end is the one that fails over TLS.
				if length is not None and size >= length:
					break
				try:
					chunk = response.raw.read(_CHUNK if length is None else min(_CHUNK, length - size))
				except OSError:
					# Many HTTPS servers hang up without TLS's close_notify: the
					# read after the last byte raises instead of returning b"".
					# With data already here and no length to wait for, that's the end.
					if size > 0 and length is None:
						break
					raise
				if not chunk:
					break
				size += len(chunk)
				file.write(chunk)
		except OSError as error:
			# Before the file opened, it's the file; after, the connection.
			opening = target and file is None
			return _fail(context, ("save_failed: " + str(error)) if opening else _reason(error), status)
		finally:
			if file is not None:
				file.close()
			response.close()

		context.set("status", status)
		context.set("size", size)
		context.set("file", target)

		error = "" if 200 <= status < 300 else "http_%d" % status

		# Pick — out of the file the body went to.
		if not path:
			context.set("value", "")
		else:
			picked = ""
			try:
				if not target:
					raise PathError("no body")
				with open(target) as source:
					document = json.load(source)
				picked = publish_value(context, pick(document, path))
			except PathError as missing:
				context.set("value", "")
				picked = "pick: " + str(missing)
			except (ValueError, OSError):
				context.set("value", "")
				picked = "pick: not JSON"
			error = error or picked

		context.set("error", error)
		return SUCCESS if 200 <= status < 300 else FALLBACK
