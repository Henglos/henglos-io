from .core.interfaces.IConfig import IConfig
from .core.services.PacketCodec import MIN_FRAME_SIZE
from .core.settings import setting

class SystemConfig(IConfig):
	# The runtime's limits (see IConfig for each): the defaults here, or the
	# workflow's overrides of the manifest's `settings` (core/settings.py).

	VERSION = "1.0.0"

	MAX_FRAME_CONTENT = setting("MAX_FRAME_CONTENT", 1024)

	MAX_FRAME_SIZE = MIN_FRAME_SIZE + MAX_FRAME_CONTENT
	DEFAULT_BAUDRATE = 115200
	STREAM_TIMEOUT_MS = setting("STREAM_TIMEOUT_MS", 2000)

	MAX_CONTEXT_ENTRIES = setting("MAX_CONTEXT_ENTRIES", 16)
	MAX_VARIABLES = setting("MAX_VARIABLES", 16)
	MAX_SCRIPT_CACHE = setting("MAX_SCRIPT_CACHE", 8)

	PROGRAM_PATH = "/program.bin"
	MAX_RECORD_SIZE = setting("MAX_RECORD_SIZE", 4096)

	COMPONENTS_DIR = "/components"
	MAX_COMPONENT_NAME = setting("MAX_COMPONENT_NAME", 32)

	CONNECTION_PATH = "/connection.json"
