
class TransportNotInitialized(Exception):
	"""The transport was not initialized"""

	def __init__(self, transport: str) -> None:
		super().__init__(f"{transport}: Was not initialized.")
		self.transport = transport

	def __str__(self) -> str:
		return f"{self.transport}: Was not initialized."


class FrameSizeExceeded(Exception):
	"""The frame received has a exceeded size"""

	def __init__(self, transport: str, frame_size: int) -> None:
		super().__init__(f"{transport}: frame size is {frame_size} bytes.")
		self.transport = transport
		self.frame_size = frame_size

	def __str__(self) -> str:
		return f"{self.transport}: frame size is {self.frame_size} bytes."
