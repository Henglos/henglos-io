# Compatibility for components written before the sdk moved to henglosio.sdk
# (hio-system 1.2.0): `from hio.sdk import ...` keeps working, with the very
# same classes and registry. New code imports henglosio.sdk.
from henglosio.sdk import (  # noqa: F401
	HIOAction, SUCCESS, FALLBACK,
	HIOTrigger,
	HIOContext,
	HIOStream, HIOStreamError,
	action, trigger,
	generate_id,
	sleep_ms, ticks_ms, ticks_diff,
)
