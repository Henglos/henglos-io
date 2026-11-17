# The runtime's modules, loaded leaves first before any of them is used — so
# each import finds what it imports already loaded, instead of nesting all the
# way down. A board's C stack holds the nested imports: from main.py or the
# REPL they went 15 levels deep, past the ESP8266's ("maximum recursion depth
# exceeded"). Here, in the package every import of the runtime goes through
# first — so it runs before anything else, one level down. The list is
# generated: scripts/preload.py.
def _preload() -> None:
	from ._preload import MODULES
	for module in MODULES:
		__import__(module)


_preload()
del _preload
