#pragma once

#include "HIOSDK/HIOSDK.h"

// Waits up to Timeout ms for one complete PacketFrame DATA frame on the
// board-to-board UART and outputs its payload.
class ReceiveAction : public HIOSDK::IAction {

	public:

		ReceiveAction();

		HIOSDK::ActionResult execute(
			HIOSDK::IBoard* board,
			HIOSDK::Common::PayloadArray* configs,
			HIOSDK::Context* context
		) override;

};
