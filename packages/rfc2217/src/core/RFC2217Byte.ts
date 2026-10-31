
// Telnet option number for RFC2217 COM Port Control
export const COM_PORT_OPTION = 44; // 0x2C

// Client → Access Server commands (1-12)
export const RFC2217Cmd = {
	SET_BAUDRATE:        1,
	SET_DATASIZE:        2,
	SET_PARITY:          3,
	SET_STOPSIZE:        4,
	SET_CONTROL:         5,
	NOTIFY_LINESTATE:    6,
	NOTIFY_MODEMSTATE:   7,
	FLOWCONTROL_SUSPEND: 8,
	FLOWCONTROL_RESUME:  9,
	SET_LINESTATE_MASK:  10,
	SET_MODEMSTATE_MASK: 11,
	PURGE_DATA:          12,
} as const;

// Access Server → Client responses (101-112)
export const RFC2217Rsp = {
	SET_BAUDRATE:        101,
	SET_DATASIZE:        102,
	SET_PARITY:          103,
	SET_STOPSIZE:        104,
	SET_CONTROL:         105,
	NOTIFY_LINESTATE:    106,
	NOTIFY_MODEMSTATE:   107,
	FLOWCONTROL_SUSPEND: 108,
	FLOWCONTROL_RESUME:  109,
	SET_LINESTATE_MASK:  110,
	SET_MODEMSTATE_MASK: 111,
	PURGE_DATA:          112,
} as const;

// SET-CONTROL subcommand values (RFC2217 §4)
export const RFC2217Control = {
	NO_FLOW:   1,
	SW_FLOW:   2,
	HW_FLOW:   3,
	BREAK_ON:  5,
	BREAK_OFF: 6,
	DTR_ON:    8,
	DTR_OFF:   9,
	RTS_ON:    11,
	RTS_OFF:   12,
} as const;
