import os


def remove_file(path: str) -> None:
	# Deletes `path`; a file that's already gone is fine.
	try:
		os.remove(path)
	except OSError:
		pass
