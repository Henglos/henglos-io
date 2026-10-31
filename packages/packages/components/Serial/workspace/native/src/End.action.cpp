#include "End.action.h"
#include "SerialCommon.h"

// Matches computeWireActionId("Serial", "End") = generateId("serial/end").
EndAction::EndAction() : HIOSDK::IAction("serial", "end") {}

HIOSDK::ActionResult EndAction::execute(
	HIOSDK::IBoard* board,
	HIOSDK::Common::PayloadArray* configs,
	HIOSDK::Context*
) {

	if (board == nullptr || configs == nullptr || configs->payloads == nullptr) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	if (!Serial::readPins(configs, "end")) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	HIOSDK::Drivers::ISerial* serial = Serial::link(board);
	if (serial == nullptr) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	serial->end();

	return Serial::boolOutput("closed", true);

}
