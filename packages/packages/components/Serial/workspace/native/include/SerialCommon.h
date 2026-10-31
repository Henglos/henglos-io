#pragma once

#include "HIOSDK/HIOSDK.h"
#include "HIOSDK/services/PacketFrame.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

// Shared helpers for the Serial actions (Begin / Send / Receive / End). They all
// drive the board's free UART — board->serial(1) — and speak the same PacketFrame
// envelope the rest of the platform uses (STX/LEN/type/id/CRC16/ETX).
namespace Serial {

	// serial(1) is the first non-control UART (UART_NUM_2 on the Esp32 board).
	inline HIOSDK::Drivers::ISerial* link(HIOSDK::IBoard* board) {
		return board != nullptr ? board->serial(1) : nullptr;
	}

	// Reads the TX/RX pin + baudrate configs for one action and applies them to
	// the link. `slug` is the action name ("send" / "receive"). Returns false on
	// any missing dependency.
	inline bool configureLink(HIOSDK::IBoard* board, HIOSDK::Common::PayloadArray* configs, const char* slug) {

		HIOSDK::Drivers::ISerial* serial = link(board);
		if (serial == nullptr || configs == nullptr) return false;

		char key[40];

		snprintf(key, sizeof(key), "%s/tx pin", slug);
		HIOSDK::Common::Payload* txCfg = HIOSDK::Util::findConfig(configs, key);

		snprintf(key, sizeof(key), "%s/rx pin", slug);
		HIOSDK::Common::Payload* rxCfg = HIOSDK::Util::findConfig(configs, key);

		snprintf(key, sizeof(key), "%s/baudrate", slug);
		HIOSDK::Common::Payload* baudCfg = HIOSDK::Util::findConfig(configs, key);

		if (txCfg == nullptr || txCfg->length < 1) return false;
		if (rxCfg == nullptr || rxCfg->length < 1) return false;

		HIOSDK::Drivers::SerialConfig cfg;
		cfg.txPin = (int8_t)txCfg->data[0];
		cfg.rxPin = (int8_t)rxCfg->data[0];

		// "options" configs arrive as raw ASCII bytes, no null terminator.
		if (baudCfg != nullptr && baudCfg->length > 0) {
			char digits[12] = {0};
			size_t n = baudCfg->length < sizeof(digits) - 1 ? baudCfg->length : sizeof(digits) - 1;
			memcpy(digits, baudCfg->data, n);
			long parsed = atol(digits);
			if (parsed > 0) cfg.baud = (uint32_t)parsed;
		}

		serial->configure(cfg);
		return true;
	}

	// "number" configs are a 4-byte little-endian float32.
	inline bool readNumber(const HIOSDK::Common::Payload* cfg, float& out) {
		if (cfg == nullptr || cfg->length < sizeof(float)) return false;
		memcpy(&out, cfg->data, sizeof(float));
		return true;
	}

	// Reads just the TX/RX pins for one action (no baud) — used by End, which
	// only needs to identify the wire it is closing. Returns false if either
	// pin config is missing.
	inline bool readPins(HIOSDK::Common::PayloadArray* configs, const char* slug) {

		if (configs == nullptr) return false;

		char key[40];

		snprintf(key, sizeof(key), "%s/tx pin", slug);
		HIOSDK::Common::Payload* txCfg = HIOSDK::Util::findConfig(configs, key);

		snprintf(key, sizeof(key), "%s/rx pin", slug);
		HIOSDK::Common::Payload* rxCfg = HIOSDK::Util::findConfig(configs, key);

		return txCfg != nullptr && txCfg->length >= 1
		    && rxCfg != nullptr && rxCfg->length >= 1;
	}

	// Single-byte boolean output, tagged generateId(outputName).
	inline HIOSDK::ActionResult boolOutput(const char* outputName, bool value) {
		auto* out     = new HIOSDK::Common::PayloadArray();
		out->payloads = new HIOSDK::Common::Payload[1];
		out->length   = 1;
		out->payloads[0].configId = HIOSDK::Util::generateId(outputName);
		out->payloads[0].type     = HIOSDK::Common::UINT_8;
		out->payloads[0].length   = 1;
		out->payloads[0].data[0]  = value ? 1 : 0;
		return { HIOSDK::OutputId::SUCCESS, out };
	}

	// One-element scalar output, tagged generateId(outputName) — a downstream
	// BIND resolves its SOURCE ID the same way.
	inline HIOSDK::ActionResult scalarOutput(const char* outputName, const uint8_t* bytes, size_t len) {
		auto* out     = new HIOSDK::Common::PayloadArray();
		out->payloads = new HIOSDK::Common::Payload[1];
		out->length   = 1;
		out->payloads[0].configId = HIOSDK::Util::generateId(outputName);
		out->payloads[0].type     = HIOSDK::Common::UINT_8;
		out->payloads[0].length   = len < HIO_MAX_DATA_BUFFER ? len : HIO_MAX_DATA_BUFFER;
		for (size_t i = 0; i < out->payloads[0].length; i++) out->payloads[0].data[i] = bytes[i];
		return { HIOSDK::OutputId::SUCCESS, out };
	}

}
