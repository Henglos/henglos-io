from micropython import const
from .core.interfaces.IConfig import IConfig
from .core.services.PacketCodec import MIN_FRAME_SIZE

class SystemConfig(IConfig):
	# The runtime's limits, as built (see IConfig for each). The platform's
	# build rewrites the ones a workflow overrides (the manifest's `settings`)
	# before compiling.

	VERSION = "1.0.0"

	MAX_FRAME_CONTENT = const(1024)

	MAX_FRAME_SIZE = MIN_FRAME_SIZE + MAX_FRAME_CONTENT
	DEFAULT_BAUDRATE = const(115200)
	STREAM_TIMEOUT_MS = const(2000)

	MAX_CONTEXT_ENTRIES = const(16)
	MAX_VARIABLES = const(16)
	MAX_SCRIPT_CACHE = const(8)

	PROGRAM_PATH = "/program.bin"
	MAX_RECORD_SIZE = const(4096)

	COMPONENTS_DIR = "/components"
	MAX_COMPONENT_NAME = const(32)

	CONNECTION_PATH = "/connection.json"
