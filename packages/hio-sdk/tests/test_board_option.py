# henglosio.sdk.board_option: the board's `scope: runtime` options, read from
# the "options" object of /hio_settings.json.

import json

from henglosio.sdk import board_option
from henglosio.sdk.core import board


def test_reads_the_options_object(tmp_path):
	path = tmp_path / "hio_settings.json"
	path.write_text(json.dumps({"MAX_VARIABLES": 32, "options": {"STATUS_LED": 5, "MODE": "fast", "INVERT": True}}))
	options = board.load(str(path))
	assert options == {"STATUS_LED": 5, "MODE": "fast", "INVERT": True}

	original = board._options
	try:
		board._options = options
		assert board_option("STATUS_LED", 2) == 5
		assert board_option("INVERT") is True
		assert board_option("MISSING", "x") == "x"
	finally:
		board._options = original


def test_no_file_or_no_options_means_defaults(tmp_path):
	assert board.load(str(tmp_path / "missing.json")) == {}
	limits_only = tmp_path / "limits.json"
	limits_only.write_text(json.dumps({"MAX_VARIABLES": 32}))
	assert board.load(str(limits_only)) == {}
	assert board_option("ANYTHING", 7) == 7
