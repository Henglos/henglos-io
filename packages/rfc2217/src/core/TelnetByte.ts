
/** Telnet's command bytes (RFC 854) and the BINARY option (RFC 856). */
export const TelnetByte = {
	BINARY: 0,  // 0x00 - Binary Transmission (RFC 856)
	SE:   240, // 0xF0 - Subnegotiation End
	NOP:  241, // 0xF1
	DM:   242, // 0xF2 - Data Mark
	BRK:  243, // 0xF3 - Break
	IP:   244, // 0xF4 - Interrupt Process
	AO:   245, // 0xF5 - Abort Output
	AYT:  246, // 0xF6 - Are You There
	EC:   247, // 0xF7 - Erase Character
	EL:   248, // 0xF8 - Erase Line
	GA:   249, // 0xF9 - Go Ahead
	SB:   250, // 0xFA - Subnegotiation Begin
	WILL: 251, // 0xFB
	WONT: 252, // 0xFC
	DO:   253, // 0xFD
	DONT: 254, // 0xFE
	IAC:  255, // 0xFF - Interpret As Command
} as const;
