# The Code component's Run (packages/library/components/Code), loaded the way
# the board would — by importing its source, which registers it.

import asyncio
import importlib.util
import json
import os

from hio.sdk import SUCCESS, FALLBACK, generate_id
from hio.system.core.Context import ActionContext, PipelineContext
from hio.system.core.services.PacketCodec import Config, DataType

_CODE = os.path.join(
	os.path.dirname(os.path.abspath(__file__)),
	"..", "..", "..", "library", "components", "Code", "src",
)

_spec = importlib.util.spec_from_file_location("code_component_run", os.path.join(_CODE, "run.py"))
run = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run)


def _run(script: str):
	pipeline = PipelineContext(16)
	pipeline.merge(Config(generate_id("run/script"), DataType.STRING, script.encode()))
	context = ActionContext(pipeline, {})
	action = run.RunAction()
	action.initialize()
	output = asyncio.run(action.execute(context))
	return output, {config.config_id: config for config in context.results}


def test_a_dict_goes_out_as_its_json():
	output, results = _run('return {"temp": 21.5, "ok": True, "tags": ["a", "b"]}')
	result = results[generate_id("result")]
	assert output == SUCCESS
	assert result.data_type == DataType.OBJECT
	assert json.loads(bytes(result.data)) == {"temp": 21.5, "ok": True, "tags": ["a", "b"]}


def test_a_list_of_objects_goes_out_as_its_json():
	output, results = _run('return [{"n": i} for i in range(3)]')
	assert output == SUCCESS
	assert json.loads(bytes(results[generate_id("result")].data)) == [{"n": 0}, {"n": 1}, {"n": 2}]


def test_what_json_cant_hold_goes_out_fallback():
	output, results = _run('return {"raw": bytes(2)}')
	assert output == FALLBACK
	assert bytes(results[generate_id("error")].data).startswith(b"can't publish")


def test_a_number_still_goes_out_as_itself():
	output, results = _run("return 3")
	assert output == SUCCESS
	assert results[generate_id("result")].data_type == DataType.INTEGER
