#pragma once

#include "HIOSDK/HIOSDK.h"

// Frames the Data config into one PacketFrame DATA frame and writes it to the
// board-to-board UART.
class SendAction : public HIOSDK::IAction {

	public:

		SendAction();

		HIOSDK::ActionResult execute(
			HIOSDK::IBoard* board,
			HIOSDK::Common::PayloadArray* configs,
			HIOSDK::Context* context
		) override;

};
