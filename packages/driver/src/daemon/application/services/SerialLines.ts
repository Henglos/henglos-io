import { SerialPort } from "serialport";

// How the driver sets a board's DTR and RTS once it opens its port.
//
// A board behind a USB-serial bridge (CP210x, CH340, FTDI…) has the usual
// auto-program circuit: an asserted RTS holds EN low (a permanent reset), DTR
// pulls the boot pin — so both are released. Espressif's own USB (303A) wires
// them to reset and boot too.
//
// A board with native USB through TinyUSB (the RP2040's MicroPython) takes a
// released DTR for "no terminal": its output buffer may then be overwritten
// when it fills, so anything longer than it (a file listing, a file) arrives
// cut and scrambled. Those get DTR, by their USB vendor id.
const DTR_VENDORS = new Set([
	"2e8a", // Raspberry Pi (RP2040, RP2350)
	"f055", // MicroPython
]);

export type SerialLineState = { dtr: boolean; rts: boolean };

/** The DTR and RTS to set on `path`: DTR for a native USB board, both released otherwise. */
export async function serialLines(path: string): Promise<SerialLineState> {
	const info = await SerialPort.list().then(ports => ports.find(port => port.path === path), () => undefined);
	const vendor = info?.vendorId?.toLowerCase();
	return { dtr: !!vendor && DTR_VENDORS.has(vendor), rts: false };
}
