#include "Begin.action.h"
#include "SerialCommon.h"

// Matches computeWireActionId("Serial", "Begin") = generateId("serial/begin").
BeginAction::BeginAction() : HIOSDK::IAction("serial", "begin") {}

HIOSDK::ActionResult BeginAction::execute(
	HIOSDK::IBoard* board,
	HIOSDK::Common::PayloadArray* configs,
	HIOSDK::Context*
) {

	if (board == nullptr || configs == nullptr || configs->payloads == nullptr) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	if (!Serial::configureLink(board, configs, "begin")) {
		return { HIOSDK::OutputId::FALLBACK, nullptr };
	}

	return Serial::boolOutput("ready", true);

}
