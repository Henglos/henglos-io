from .PacketCodec import PacketCodec, Frame, HEADER_SIZE, MAX_FRAME_SIZE, u16
from ..compat import makedirs
import os

# Where ACTION_ID and INSTANCE_ID sit in a stored EXECUTE frame: STX + LEN(16)
# + FRAME_TYPE + FRAME_ID(16) + COMMAND_ID, then the action body.
_ACTION_ID_AT = HEADER_SIZE + 3 + 1
_INSTANCE_ID_AT = _ACTION_ID_AT + 2


class ProgramStorage:
	# The recorded program: every frame appended in wire format (STX + LEN +
	# ... + ETX). Wire format so reading it back is just PacketCodec.resolve —
	# which also checks each frame's CRC.
	#
	# Played by INSTANCE_ID, not in file order: index() notes where each
	# node's frame is, and frame_at() reads the one the flow points at — a
	# jump back (Repeat, branches that join) lands where it should.

	def __init__(self, path: str) -> None:
		# `path`: the program file itself; its folder is created if missing.
		self.path = path
		if "/" in path:
			makedirs(path[:path.rfind("/")])

		# Kept open between reads — opening a file per frame is slow on
		# flash. Closed by clear() before the file is deleted.
		self._file = None

		# Every read lands here: the returned Frame is a view into it, valid
		# until the following read.
		self._buffer = bytearray(MAX_FRAME_SIZE)
		self._view = memoryview(self._buffer)

		# Set by index(), dropped whenever the program changes or is
		# replayed from the start (indexed is then False).
		self._offsets = None            # INSTANCE_ID -> offset of its frame
		self.start = None               # offset of "core/start"'s frame
		self.triggers = []              # offsets of the trigger frames

	@property
	def indexed(self) -> bool:
		return self._offsets is not None

	def write(self, data: bytes) -> bool:
		# Appends one whole frame, already in wire format (e.g. a packet's
		# encode()).
		self._offsets = None

		try:
			with open(self.path, "ab") as file:
				file.write(data)

			return True
		except OSError:
			return False

	def index(self, is_trigger, start_action_id: int) -> bool:
		# Scans the program once: where every node's frame is, which one is
		# the Start and which are triggers (`is_trigger(action_id)`). False
		# when there's no program.
		offsets = {}
		self.start = None
		self.triggers = []

		self.rewind()
		offset = 0
		while True:
			frame = self.next()
			if frame is None:
				break

			size = frame.end + 1
			if size > _INSTANCE_ID_AT + 1:
				action_id = u16(self._buffer, _ACTION_ID_AT)
				instance_id = u16(self._buffer, _INSTANCE_ID_AT)
				if action_id == start_action_id:
					self.start = offset
				elif is_trigger(action_id):
					self.triggers.append(offset)
				if instance_id:
					offsets[instance_id] = offset

			offset += size

		self._offsets = offsets
		return offset > 0

	def frame_at(self, instance_id: int) -> "Frame | None":
		# The frame of node `instance_id`, None when the program has none.
		offset = self._offsets.get(instance_id) if self._offsets is not None else None
		return None if offset is None else self.frame_at_offset(offset)

	def frame_at_offset(self, offset: int) -> "Frame | None":
		if self._file is None:
			try: self._file = open(self.path, "rb")
			except OSError: return None
		self._file.seek(offset)
		return self.next()

	def next(self) -> Frame | None:
		# The frame after the last one read, None at the end of the program
		# — or when there's no program, or what's left can't be read as a frame.

		if self._file is None:
			try: self._file = open(self.path, "rb")
			except OSError: return None

		if self._file.readinto(self._view[:HEADER_SIZE]) != HEADER_SIZE:
			return None

		size = HEADER_SIZE + u16(self._buffer, 1) + 1   # + ETX
		if size > len(self._buffer):
			return None

		if self._file.readinto(self._view[HEADER_SIZE:size]) != size - HEADER_SIZE:
			return None

		return PacketCodec.resolve(self._view[:size])

	def rewind(self) -> None:
		# Back to the first frame — and played from the start again: the
		# index is redone, the triggers re-armed (see MainTask).
		self._offsets = None
		if self._file is not None:
			self._file.seek(0)

	def size(self) -> int:
		# Size of the program file in bytes, 0 when there's none.
		try: return os.stat(self.path)[6]
		except OSError: return 0

	def clear(self) -> None:
		self._offsets = None

		if self._file is not None:
			self._file.close()
			self._file = None

		try: os.remove(self.path)
		except OSError: pass
