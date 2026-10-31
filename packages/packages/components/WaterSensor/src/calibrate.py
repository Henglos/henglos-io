from hio.sdk import HIOAction, action, SUCCESS, FALLBACK

from .water import calibrate, raw, text


# Water Sensor / Calibrate — takes the reading now as the sensor's Dry (out
# of the water) or Wet (as deep as it'll go) raw level, for Read, Detect and
# Water Trigger on the same Signal pin. Kept in a file on the board
# (water.CALIBRATION_FILE): it stays across sessions and restarts.
#
# Wire ids:
#   ACTION_ID  "water sensor/calibrate"
#   configs    "calibrate/signal pin", "calibrate/power pin" (pin -> UINT_8),
#              "calibrate/point" (options -> text: dry | wet), "calibrate/samples" (number)
#   outputs    "raw" (int — what it read), "dry", "wet" (int — the levels set so far)


@action("water sensor/calibrate")
class CalibrateAction(HIOAction):

	async def execute(self, context):
		signal = context.get("calibrate/signal pin")
		if signal is None:
			return FALLBACK
		point = text(context.get("calibrate/point"), "dry")
		if point not in ("dry", "wet"):
			return FALLBACK
		samples = context.get("calibrate/samples")
		value = raw(signal, context.get("calibrate/power pin"), 16 if samples is None else samples)
		measured = calibrate(signal, point, value)
		context.set("raw", value)
		if "dry" in measured:
			context.set("dry", measured["dry"])
		if "wet" in measured:
			context.set("wet", measured["wet"])
		return SUCCESS
