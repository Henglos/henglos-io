#include "Receive.action.h"
#include "SerialCommon.h"

// Matches computeWireActionId("Serial", "Receive") = generateId("serial/receive").
ReceiveAction::ReceiveAction() : HIOSDK::IAction("serial", "receive") {}

HIOSDK::ActionResult ReceiveAction::execute(
	HIOSDK::IBoard* board,
	HIOSDK::Common::PayloadArray* configs,
	HIOSDK::Context*
) {

	if (board == nullptr || configs == nullptr || configs->payloads == nullptr) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	if (!Serial::configureLink(board, configs, "receive")) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	HIOSDK::Drivers::ISerial* serial   = Serial::link(board);
	HIOSDK::Drivers::IWatchdog* watchdog = board->watchdog();

	float timeoutF = 1000.0f;
	Serial::readNumber(HIOSDK::Util::findConfig(configs, "receive/timeout"), timeoutF);
	if (timeoutF < 0) timeoutF = 0;
	if (timeoutF > 30000) timeoutF = 30000;
	const uint32_t timeoutMs = (uint32_t)timeoutF;

	constexpr uint16_t CHUNK_MS = 20;

	uint8_t buffer[HIO_MAX_PACKET_SIZE];
	size_t  length  = 0;
	uint32_t elapsed = 0;

	while (elapsed <= timeoutMs) {

		while (serial->available() > 0 && length < sizeof(buffer)) {
			int byte = serial->read();
			if (byte < 0) break;
			buffer[length++] = (uint8_t)byte;
		}

		HIOSDK::Services::FrameView view = HIOSDK::Services::PacketFrame::scan(buffer, length);
		if (view.valid && view.type == HIOSDK::Services::FrameType::DATA) {
			return Serial::scalarOutput("data", view.payload, view.payloadLength);
		}

		// A full buffer with no valid frame in it is unrecoverable garbage —
		// drop the oldest half and keep going rather than wedging.
		if (length == sizeof(buffer)) {
			memmove(buffer, buffer + sizeof(buffer) / 2, sizeof(buffer) / 2);
			length = sizeof(buffer) / 2;
		}

		if (watchdog != nullptr) watchdog->tick(CHUNK_MS);
		elapsed += CHUNK_MS;
	}

	return { HIOSDK::OutputId::FALLBACK, nullptr };

}
