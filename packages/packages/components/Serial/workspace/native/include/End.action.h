#pragma once

#include "HIOSDK/HIOSDK.h"

// Closes the board-to-board UART, releasing the driver and pins. Pairs with
// Begin to bracket a run of Send/Receive actions.
class EndAction : public HIOSDK::IAction {

	public:

		EndAction();

		HIOSDK::ActionResult execute(
			HIOSDK::IBoard* board,
			HIOSDK::Common::PayloadArray* configs,
			HIOSDK::Context* context
		) override;

};
