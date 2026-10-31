
import { TelnetByte } from "./TelnetByte.js";

const enum State {
	DATA,
	IAC,
	NEGOTIATION,
	SB,
	SB_IAC,
}

/**
 * Splits a Telnet byte stream into what it carries: plain data (onData),
 * option negotiation (onWill / onWont / onDo / onDont) and subnegotiations
 * (onSubnegotiation). Keeps its state between calls, so a command split
 * across two chunks is still read whole.
 */
export class TelnetParser {

	onData?:           (data: Uint8Array) => void;
	onWill?:           (option: number) => void;
	onWont?:           (option: number) => void;
	onDo?:             (option: number) => void;
	onDont?:           (option: number) => void;
	onSubnegotiation?: (option: number, data: Uint8Array) => void;

	private state: State = State.DATA;
	private negotiationCommand = 0;
	private sbBuffer: number[] = [];
	private dataBuffer: number[] = [];

	/** Reads the next chunk of the stream, calling the handlers as it goes. */
	parse(data: Uint8Array) {
		for (const byte of data) {
			switch (this.state) {

				case State.DATA:
					if (byte === TelnetByte.IAC) {
						this.flushData();
						this.state = State.IAC;
					} else {
						this.dataBuffer.push(byte);
					}
					break;

				case State.IAC:
					switch (byte) {
						case TelnetByte.IAC:
							// IAC IAC = literal 0xFF in the data stream
							this.dataBuffer.push(TelnetByte.IAC);
							this.state = State.DATA;
							break;
						case TelnetByte.WILL:
						case TelnetByte.WONT:
						case TelnetByte.DO:
						case TelnetByte.DONT:
							this.negotiationCommand = byte;
							this.state = State.NEGOTIATION;
							break;
						case TelnetByte.SB:
							this.sbBuffer = [];
							this.state = State.SB;
							break;
						default:
							// Single-byte commands (NOP, GA, AYT, etc.)
							this.state = State.DATA;
							break;
					}
					break;

				case State.NEGOTIATION:
					this.dispatchNegotiation(this.negotiationCommand, byte);
					this.state = State.DATA;
					break;

				case State.SB:
					if (byte === TelnetByte.IAC) {
						this.state = State.SB_IAC;
					} else {
						this.sbBuffer.push(byte);
					}
					break;

				case State.SB_IAC:
					if (byte === TelnetByte.SE) {
						const option = this.sbBuffer[0];
						if (option !== undefined) {
							const payload = new Uint8Array(this.sbBuffer.slice(1));
							this.onSubnegotiation?.(option, payload);
						}
						this.sbBuffer = [];
						this.state = State.DATA;
					} else if (byte === TelnetByte.IAC) {
						// IAC IAC inside SB = a literal 0xFF
						this.sbBuffer.push(TelnetByte.IAC);
						this.state = State.SB;
					} else {
						// Invalid protocol — drop the current SB and go back to normal
						this.sbBuffer = [];
						this.state = State.DATA;
					}
					break;
			}
		}

		this.flushData();
	}

	private flushData() {
		if (this.dataBuffer.length === 0) return;
		this.onData?.(new Uint8Array(this.dataBuffer));
		this.dataBuffer = [];
	}

	private dispatchNegotiation(command: number, option: number) {
		switch (command) {
			case TelnetByte.WILL: this.onWill?.(option); break;
			case TelnetByte.WONT: this.onWont?.(option); break;
			case TelnetByte.DO:   this.onDo?.(option);   break;
			case TelnetByte.DONT: this.onDont?.(option); break;
		}
	}

}
