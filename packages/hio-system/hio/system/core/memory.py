import gc

# Keeps the Python heap from growing. On an ESP32, MicroPython grows its heap
# into the chip's own memory when an allocation doesn't fit — and never gives
# it back — while that same memory is where WiFi and TLS take their buffers
# (an HTTPS handshake wants ~40 KB of it). Garbage left around is what makes
# it grow: collected early, the heap stays at what the runtime really holds.


def tighten() -> None:
	# A collection every time a quarter of what's free got allocated — before
	# the heap has to grow, instead of only once it can't. MicroPython's
	# gc.threshold(); a no-op elsewhere (the tests' CPython).
	gc.collect()
	try:
		gc.threshold(gc.mem_free() // 4 + gc.mem_alloc())
	except AttributeError:
		pass


def collect() -> None:
	# Before something that may want a lot at once — an action (a TLS
	# handshake, a big buffer) — and after the host's exchanges, which leave
	# their frames' text behind.
	gc.collect()
