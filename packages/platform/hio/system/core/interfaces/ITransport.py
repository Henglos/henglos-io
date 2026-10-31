from micropython import const

class TransportType:
    # What a transport runs over — what type() answers.
    SERIAL = const(0)
    SD = const(1)
    BLUETOOTH = const(2)
    WIFI = const(3)
    STORAGE = const(4)
    MEMORY = const(5)

class ITransport:
	# A link frames come in on and answers go out on — the serial control
	# link (SerialTransport), or memory in the tests (MemoryTransport).

	def type(self) -> int:
		# Which TransportType it is.
		raise NotImplementedError

	def begin(self) -> None:
		# Opens the link.
		raise NotImplementedError

	def end(self) -> None:
		# Closes it.
		raise NotImplementedError

	def write(self, data) -> int:
		# Sends `data`; how many bytes went out.
		raise NotImplementedError

	def readinto(self, buffer) -> int:
		# Reads what's waiting into `buffer`; how many bytes it read.
		raise NotImplementedError

	def available(self) -> int:
		# How many bytes are waiting to be read.
		raise NotImplementedError



