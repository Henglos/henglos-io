# Wire-level frame protocol between the host and HIO firmware.
# Port of platform_old's HIOFirmware::Core::PacketCodec (C++) — mirrored on the
# host side by @henglosio/shared's src/protocol/packet.ts, keep them in sync.
#
# Base Frame:
#   +-----+-----+------------+----------+---------+-------+-----+
#   |  8  | 16  |     8      |    16    |   ...   |  16   |  8  |
#   +-----+-----+------------+----------+---------+-------+-----+
#   | STX | LEN | FRAME TYPE | FRAME ID | PAYLOAD | CRC16 | ETX |
#   +-----+-----+------------+----------+---------+-------+-----+
#
#   LEN   = FRAME_TYPE + FRAME_ID + PAYLOAD + CRC16 (ETX not included), little-endian.
#   CRC16 = CRC-16/MODBUS (init 0xFFFF, poly 0xA001) over FRAME_TYPE + FRAME_ID + PAYLOAD.
#   Every multi-byte field on the wire is little-endian.
#
# PAYLOAD per FRAME TYPE:
#
#   REQUEST  (host -> firmware): COMMAND_ID(8) + body
#     This codec only handles the envelope and COMMAND_ID: every command has
#     its own packet class (hio/system/core/packets/) that decodes its body,
#     registered here by COMMAND_ID — see register_request.
#
#   RESPONSE (firmware -> host): COMMAND_ID(8) + ID(16) + DATA
#     ID: outputId for EXECUTE and RUN (SUCCESS=0x0000, FALLBACK=0xFFFF,
#     ACTION_NOT_FOUND=0xFFFE, custom), a StreamStatus for COMMAND_ID STREAM,
#     0x0000 for everything else.
#     DATA entries: CONFIG_ID(16) + DATA_SIZE(16) + DATA — no type byte.
#
# STREAMS — a config whose value is too big for the EXECUTE that runs the
# action. The EXECUTE declares it as VALUE_TYPE STREAM (DATA_TYPE +
# TOTAL_SIZE, see packets/ActionBody) and its data follows as REQUESTs of
# COMMAND_ID STREAM, read by the action itself (HIOAction.batch):
#
#   REQUEST STREAM (host -> firmware): STREAM_REF(16) + CONFIG_ID(16) + CHUNK
#     STREAM_REF: FRAME_ID of the EXECUTE that declared the stream
#     CONFIG_ID:  which of its STREAM configs this chunk belongs to
#     CHUNK:      a whole number of DATA_TYPE elements — never split one
#
#   The stream ends once TOTAL_SIZE bytes arrived. TOTAL_SIZE 0 means an
#   open-ended stream: it ends on a chunk with an empty CHUNK instead.
#
#   Every chunk is answered with RESPONSE STREAM, FRAME_ID = the chunk's own,
#   ID = StreamStatus — OK only once the action is done with the chunk (it
#   asked for the next one, or it ended): the host sends the next chunk only
#   after that OK. TIMEOUT has FRAME_ID = STREAM_REF: nothing arrived in time.
#
#   While the action reads a stream the firmware runs nothing else: every
#   other REQUEST — another command, or a chunk for another config — is
#   consumed and answered with RESPONSE STREAM, FRAME_ID = the rejected
#   frame's own, ID = StreamStatus.WAITING and one DATA entry telling the
#   host what to send instead: CONFIG_ID = the config being read, DATA =
#   its STREAM_REF(16).
#
#   Outside of that, a REQUEST STREAM matches no open stream and is answered
#   NOT_FOUND — never run as anything else.
#
#   DEBUG    (firmware -> host): DEBUG_TYPE(8) + message bytes up to the end
#     of the payload (no length prefix, no terminator).
#
#   DATA     (board -> board): raw bytes, no command layer.
#
#   The firmware only ever receives REQUEST, so only that is decoded here;
#   RESPONSE and DEBUG are only built (build_response/build_debug).
#
# Zero-copy: scan()/decode() never copy the frame. Frame.payload and every
# byte field a packet class hands out is a memoryview into the buffer that was
# scanned, valid only until that buffer changes — anything that has to outlive
# the dispatch of this packet (Record archiving it, a value stored in the
# Context, a value handed to an SDK action) must copy it with bytes(...) first.

from ..interfaces.IPacket import IPacket
from ..settings import setting


STX = 0x02
ETX = 0x03

HEADER_SIZE = 3                                       # STX + LEN(16)
MIN_PACKET_SIZE = 5                                   # FRAME_TYPE + FRAME_ID(16) + CRC16(16), empty payload
MIN_FRAME_SIZE = HEADER_SIZE + MIN_PACKET_SIZE + 1    # + ETX

# Board limits — the protocol's, so the host builds its packets with the same
# values (@henglosio/workflow's protocolLimits): the defaults here, or the
# workflow's overrides (core/settings.py).
MAX_PACKET_SIZE = setting("MAX_PACKET_SIZE", 1024)                  # upper bound for LEN
MAX_DATA_BUFFER = setting("MAX_DATA_BUFFER", 512)                   # one resolved config value (a list or an object's JSON included)
MAX_CODE_BUFFER = setting("MAX_CODE_BUFFER", 192)                   # one CODE config's source text
MAX_CONFIGS_PER_COMMAND = setting("MAX_CONFIGS_PER_COMMAND", 15)
MAX_OUTPUTS_PER_ACTION = setting("MAX_OUTPUTS_PER_ACTION", 4)
MAX_FRAME_SIZE = HEADER_SIZE + MAX_PACKET_SIZE + 1

# Room left for PAYLOAD once FRAME_TYPE + FRAME_ID and CRC16 are counted in LEN.
MAX_PAYLOAD_SIZE = MAX_PACKET_SIZE - 3 - 2


class FrameType:
	# A frame's FRAME_TYPE: a command from the host (REQUEST), its answer
	# (RESPONSE), a device log line (DEBUG), or a stream's data (DATA).
	REQUEST = 0x01
	RESPONSE = 0x02
	DEBUG = 0x06
	DATA = 0x10


class CommandId:
	# A REQUEST's COMMAND_ID — which command it is (its packet class in packets/).
	EXECUTE = 0x01
	STANDALONE = 0x02
	PLAY = 0x03
	RECORD = 0x04
	FINISH_RECORD = 0x05
	ERASE_RECORD = 0x06
	GET_VERSION = 0x07
	SET_CONNECTION = 0x08
	ADD_COMPONENT = 0x09    # reserved — components are installed as files over the REPL, not by frame
	REMOVE_COMPONENT = 0x0A
	STREAM = 0x0B       # one chunk of a STREAM config, and every answer to one — see STREAMS above
	RUN = 0x0C          # one action on its own, outside the flow — see packets/RunPacket
	CONTEXT_SET = 0x0D  # overwrite values the run holds (the debugger) — see packets/ContextSetPacket
	TRIGGER_POLL = 0x0E # between branches: did an armed trigger fire? — see packets/TriggerPollPacket


# RESPONSE ID of an EXECUTE: which output the action ended on. Custom outputs
# are generate_id("<output name>").
class OutputId:
	SUCCESS = 0x0000
	ACTION_NOT_FOUND = 0xFFFE
	FALLBACK = 0xFFFF


# DEBUG_TYPE of a DEBUG frame.
class DebugLevel:
	INFO = 0x00
	WARN = 0x01
	ERROR = 0x02


# RESPONSE ID of a RESPONSE STREAM.
class StreamStatus:
	OK = 0x0000
	WAITING = 0xFFFA        # frame rejected: an action is reading a stream — see STREAMS above
	TIMEOUT = 0xFFFB        # no chunk arrived in time — stream closed
	INVALID = 0xFFFC        # misaligned chunk or size mismatch with TOTAL_SIZE — stream closed
	NOT_FOUND = 0xFFFD      # no open stream for STREAM_REF + CONFIG_ID


class ConfigValueType:
	# Where an EXECUTE config's value comes from: the frame itself (LITERAL),
	# another action's output (BIND), a script (CODE), stream chunks (STREAM),
	# or a workflow variable (VARIABLE).
	LITERAL = 0x00
	BIND = 0x01
	CODE = 0x02
	STREAM = 0x03
	VARIABLE = 0x04     # the config's value is a workflow variable — see GlobalVariables


class DataType:
	# A value's type on the wire — the ones MicroPython has, nothing narrower:
	#   INTEGER  a Python int, as int32 little-endian (4 bytes)
	#   FLOAT    a Python float, as float32 little-endian (4 bytes)
	#   BOOL     1 byte, 0 or 1
	#   STRING   a str, UTF-8
	#   LIST     a list, its JSON (UTF-8)
	#   OBJECT   a dict, its JSON (UTF-8)
	#   BYTES    raw bytes — a file, a color's RGBA, a credential: never a
	#            type the user picks, only what such configs carry
	# The first three are fixed-size; the rest are sized (DATA_SIZE(16) before
	# their data wherever a value is written out). What shape a list or an
	# object has is the manifest's to say; the wire only carries it.
	INTEGER = 0
	FLOAT = 1
	BOOL = 2
	STRING = 3
	LIST = 4
	OBJECT = 5
	BYTES = 6
	# Only an EXPECTED_TYPE / RESULT_TYPE, never a value's: the value goes on
	# as the type it already is (a script's return, a bind into an "any").
	AUTO = 0x0F


_FIXED_SIZES = {DataType.INTEGER: 4, DataType.FLOAT: 4, DataType.BOOL: 1}


def is_data_type(data_type: int) -> bool:
	# Whether `data_type` is a value's type (AUTO isn't).
	return DataType.INTEGER <= data_type <= DataType.BYTES


def is_sized(data_type: int) -> bool:
	# Whether a value of `data_type` carries its DATA_SIZE (STRING, LIST, OBJECT, BYTES).
	return DataType.STRING <= data_type <= DataType.BYTES


def fixed_size(data_type: int) -> int:
	# Bytes of a fixed-size value — 0 for a sized type, an unknown one or AUTO.
	return _FIXED_SIZES.get(data_type, 0)


def element_size(data_type: int) -> int:
	# What a STREAM's chunks must hold a whole number of: a fixed-size value,
	# or a byte of a sized one. 0 for an unknown type (or AUTO).
	if is_sized(data_type):
		return 1
	return fixed_size(data_type)


# Little-endian helpers shared with the packet classes. Module-level on
# purpose: a global call is cheaper than a class attribute lookup on
# MicroPython, and these run several times per frame.
def u16(buffer: "bytes | bytearray | memoryview", index: int) -> int:
	return buffer[index] | (buffer[index + 1] << 8)


def put_u16(buffer: bytearray, value: int) -> None:
	# Appends `value` as a little-endian uint16.
	buffer.append(value & 0xFF)
	buffer.append((value >> 8) & 0xFF)


class OutputLink:
	# An EXECUTE's wire: when the action ends on `output_id`, the node to run
	# next is `target_instance_id`.

	def __init__(self, output_id: int, target_instance_id: int) -> None:
		self.output_id = output_id
		self.target_instance_id = target_instance_id


class BindLink:
	# A BIND config: its value is what an earlier action published under
	# `source_id`, read from the run's context when the action runs — converted
	# to `expected_type` (a DATA_TYPE, AUTO: as it is) first, see Context.coerce.

	def __init__(self, config_id: int, source_id: int, expected_type: int = DataType.AUTO) -> None:
		self.config_id = config_id
		self.source_id = source_id
		self.expected_type = expected_type


# A VARIABLE config: its value is read from GlobalVariables when the action runs,
# converted to `expected_type` like a BIND's.
class VariableLink:

	def __init__(self, config_id: int, variable_id: int, expected_type: int = DataType.AUTO) -> None:
		self.config_id = config_id
		self.variable_id = variable_id
		self.expected_type = expected_type


class CodeLink:
	# A CODE config: its value is what the script `code` returns (ScriptEngine),
	# as `result_type` (AUTO: as the type it returned).

	def __init__(self, config_id: int, result_type: int, code: "memoryview | bytes") -> None:
		self.config_id = config_id
		self.result_type = result_type
		self.code = code


# A STREAM config: no value in the EXECUTE, it arrives as REQUEST STREAM chunks.
class StreamLink:

	def __init__(self, config_id: int, data_type: int, total_size: int) -> None:
		self.config_id = config_id
		self.data_type = data_type          # every chunk is a whole number of element_size(data_type) bytes
		self.total_size = total_size        # bytes across every chunk — 0: open-ended, ends on an empty chunk


# A LITERAL config value, or a RESPONSE DATA entry.
class Config:

	def __init__(self, config_id: int, data_type: int, data: "memoryview | bytes") -> None:
		self.config_id = config_id
		self.data_type = data_type          # DataType
		self.data = data


# One structurally valid frame (STX/LEN/CRC16/ETX consistent) found by PacketCodec.scan().
# `payload` is a view into the scanned buffer — see the zero-copy note above.
class Frame:

	def __init__(self, frame_type: int, frame_id: int, payload: memoryview, begin: int, end: int) -> None:
		self.frame_type = frame_type
		self.frame_id = frame_id
		self.payload = payload          # bytes after FRAME_ID, before CRC16
		self.begin = begin              # index of STX in the scanned buffer
		self.end = end                  # index of ETX in the scanned buffer


class PacketCodec:

	# COMMAND_ID -> packet class for REQUEST frames, each exposing COMMAND_ID
	# and a static decode(frame_id, body).
	_requests: "dict[int, type[IPacket]]" = {}

	@staticmethod
	def register_request(packet_class: "type[IPacket]") -> None:
		PacketCodec._requests[packet_class.COMMAND_ID] = packet_class

	@staticmethod
	def crc16(data: "bytes | bytearray | memoryview") -> int:
		crc = 0xFFFF
		for byte in data:
			crc ^= byte
			for _ in range(8):
				if crc & 1:
					crc = (crc >> 1) ^ 0xA001
				else:
					crc >>= 1
		return crc

	@staticmethod
	def resolve(buffer: "bytes | bytearray | memoryview") -> "Frame | None":
		# Returns the first valid frame in `buffer`, skipping leading noise (e.g. an
		# ESP32 boot log sharing the UART). None means no complete valid frame yet —
		# the caller should accumulate more bytes and retry.

		view = memoryview(buffer)
		length = len(buffer)
		i = 0

		while i + MIN_FRAME_SIZE <= length:

			if buffer[i] == STX:

				packet_len = u16(buffer, i + 1)
				etx_index = i + HEADER_SIZE + packet_len

				if MIN_PACKET_SIZE <= packet_len <= MAX_PACKET_SIZE and etx_index < length and buffer[etx_index] == ETX:

					start = i + HEADER_SIZE
					crc_len = packet_len - 2

					if PacketCodec.crc16(view[start:start + crc_len]) == u16(buffer, start + crc_len):
						return Frame(
							buffer[start],
							u16(buffer, start + 1),
							view[start + 3:start + crc_len],
							i,
							etx_index,
						)

			i += 1

		return None

	@staticmethod
	def decode(frame: Frame) -> "IPacket | None":
		# The command's packet (e.g. ExecutePacket), or None when the frame
		# type isn't one the firmware receives, the COMMAND_ID has no
		# registered packet, or the body is malformed.

		payload = frame.payload

		if frame.frame_type == FrameType.REQUEST:

			if len(payload) < 1:
				return None

			packet_class = PacketCodec._requests.get(payload[0])
			if packet_class is None:
				return None

			return packet_class.decode(frame.frame_id, payload[1:])

		return None

	@staticmethod
	def build_frame(frame_type: int, frame_id: int, payload: "bytes | bytearray | memoryview" = b"") -> bytes:

		if len(payload) > MAX_PAYLOAD_SIZE:
			raise ValueError("payload too large: %d bytes (max %d)" % (len(payload), MAX_PAYLOAD_SIZE))

		body = bytearray()
		body.append(frame_type)
		put_u16(body, frame_id)
		body.extend(payload)

		crc = PacketCodec.crc16(body)

		frame = bytearray()
		frame.append(STX)
		put_u16(frame, len(body) + 2)      # + CRC16, ETX excluded
		frame.extend(body)
		put_u16(frame, crc)
		frame.append(ETX)

		return bytes(frame)

	@staticmethod
	def build_response(frame_id: int, command_id: int, id: int = 0, configs: "list[Config] | tuple[Config, ...] | None" = None) -> bytes:
		# `frame_id` echoes the REQUEST being answered. Config entries that
		# don't fit MAX_PAYLOAD_SIZE are dropped, not split.

		payload = bytearray()
		payload.append(command_id)
		put_u16(payload, id)

		for config in configs or ():

			if len(payload) + 4 + len(config.data) > MAX_PAYLOAD_SIZE:
				break

			put_u16(payload, config.config_id)
			put_u16(payload, len(config.data))
			payload.extend(config.data)

		return PacketCodec.build_frame(FrameType.RESPONSE, frame_id, payload)

	@staticmethod
	def build_debug(frame_id: int, level: int, message: "str | bytes") -> bytes:
		# The message is truncated, not rejected, when it doesn't fit.
		if isinstance(message, str):
			message = message.encode()

		payload = bytearray()
		payload.append(level)
		payload.extend(message[:MAX_PAYLOAD_SIZE - 1])

		return PacketCodec.build_frame(FrameType.DEBUG, frame_id, payload)
