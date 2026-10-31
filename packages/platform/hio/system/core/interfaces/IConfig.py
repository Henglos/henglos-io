
class IConfig:
	# The runtime's limits and paths — what SystemConfig sets. Several are
	# platform settings a workflow can override at build time (the platform
	# manifest's `settings`).

	# The runtime's version, answered to GET_VERSION.
	VERSION: str

	# The biggest frame the control link carries, and its baud rate until
	# SET_CONNECTION sets another.
	MAX_FRAME_SIZE: int
	DEFAULT_BAUDRATE: int

	# How long an action reading a stream waits for the host's next chunk
	# before the stream fails with TIMEOUT.
	STREAM_TIMEOUT_MS: int

	# Values shared between the actions of a run (PipelineContext).
	MAX_CONTEXT_ENTRIES: int

	# Workflow variables held at once (GlobalVariables) — kept across loops.
	MAX_VARIABLES: int

	# Compiled CODE scripts kept around (ScriptEngine) — each distinct
	# source is compiled once while it stays in the cache.
	MAX_SCRIPT_CACHE: int

	# Stored program: recorded EXECUTE frames, replayed by STANDALONE.
	PROGRAM_PATH: str
	MAX_RECORD_SIZE: int

	# Installed components: <COMPONENTS_DIR>/<namespace>/<name>.mpy
	COMPONENTS_DIR: str
	MAX_COMPONENT_NAME: int

	# Control-link UART config written by SET_CONNECTION, applied at boot.
	CONNECTION_PATH: str

