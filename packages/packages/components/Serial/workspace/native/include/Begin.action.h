#pragma once

#include "HIOSDK/HIOSDK.h"

// Opens the board-to-board UART with the configured TX/RX pins and baud rate.
// Send/Receive also configure the link on their own, so this is optional — it
// just lets a workflow bring the link up once up front.
class BeginAction : public HIOSDK::IAction {

	public:

		BeginAction();

		HIOSDK::ActionResult execute(
			HIOSDK::IBoard* board,
			HIOSDK::Common::PayloadArray* configs,
			HIOSDK::Context* context
		) override;

};
