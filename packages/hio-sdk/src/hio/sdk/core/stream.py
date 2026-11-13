class HIOStreamError(Exception):
	# The stream ended before all its data arrived: timeout, an invalid chunk,
	# or the host gave up.
	pass


class HIOStream:
	# A config whose value arrives in chunks while the action is already
	# running, instead of inside the EXECUTE — for values too big for one frame
	# (e.g. the state of every LED in a strip). Consumed with `async for`:
	#
	#   async def execute(self, ctx):
	#       async for chunk in self.batch("leds"):
	#           self.strip.write(chunk)
	#
	# Each chunk is a memoryview holding a whole number of `data_type`
	# elements. It's only valid until the loop asks for the next one — copy
	# with bytes(chunk) anything that must outlive that. The host only sends
	# the next chunk after this one is consumed, so a slow loop body slows the
	# host down instead of losing data. While the action waits for a chunk,
	# nothing else runs on the board.
	#
	# The loop ends normally after the last chunk (TOTAL_SIZE bytes, or the
	# empty end chunk of an open-ended stream), or raises HIOStreamError.
	# A stream can be read once.

	config_id: int
	data_type: int          # DataType — chunks hold whole values of it (a byte of a sized one)
	total_size: int         # bytes across every chunk — 0 when open-ended
	received: int           # bytes delivered so far

	def __aiter__(self) -> "HIOStream":
		return self

	async def __anext__(self) -> memoryview:
		raise NotImplementedError

	async def read(self) -> bytearray:
		# The whole value at once, for one that fits in RAM:
		#   data = await self.batch("text").read()
		# Filled in place into a buffer sized from TOTAL_SIZE up front — no
		# reallocation per chunk. An open-ended stream has no size to start
		# from, so it grows as chunks arrive.
		if not self.total_size:
			data = bytearray()
			async for chunk in self:
				data.extend(chunk)
			return data

		data = bytearray(self.total_size)
		view = memoryview(data)
		offset = 0
		async for chunk in self:
			view[offset:offset + len(chunk)] = chunk
			offset += len(chunk)
		return data
