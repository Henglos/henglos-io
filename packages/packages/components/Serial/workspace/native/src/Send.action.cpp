#include "Send.action.h"
#include "SerialCommon.h"

// Matches computeWireActionId("Serial", "Send") = generateId("serial/send").
SendAction::SendAction() : HIOSDK::IAction("serial", "send") {}

HIOSDK::ActionResult SendAction::execute(
	HIOSDK::IBoard* board,
	HIOSDK::Common::PayloadArray* configs,
	HIOSDK::Context*
) {

	if (board == nullptr || configs == nullptr || configs->payloads == nullptr) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	if (!Serial::configureLink(board, configs, "send")) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	HIOSDK::Drivers::ISerial* serial = Serial::link(board);

	HIOSDK::Common::Payload* dataCfg = HIOSDK::Util::findConfig(configs, "send/data");
	const uint8_t* payload = (dataCfg != nullptr) ? dataCfg->data : nullptr;
	const size_t   length  = (dataCfg != nullptr) ? dataCfg->length : 0;

	static uint16_t s_frameId = 0;
	HIOSDK::Services::BuiltFrame frame = HIOSDK::Services::PacketFrame::build(
		HIOSDK::Services::FrameType::DATA, s_frameId++, payload, length
	);

	serial->write(frame.data, frame.size);

	const uint16_t sent = (uint16_t)length;
	const uint8_t  out[2] = { (uint8_t)(sent & 0xFF), (uint8_t)(sent >> 8) };
	return Serial::scalarOutput("sent", out, 2);

}
