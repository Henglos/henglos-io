import * as common from "./common.js";

// The input filters a manifest can put on a config — by name, so a package
// author picks them instead of writing regexes:
//
//   patterns:
//     - AlphanumericUnderscore          # a named filter
//     - { name: MaxLength, value: 16 }  # a filter that takes a number
//     - { regex: "^[a-z]", message: "Must start lowercase." }   # escape hatch
//   patternMatch: all                   # all (default) | any
//
// Each filter is a validator with the message the studio shows when the value
// fails it; the same check runs when the workflow is compiled (see
// GenerateExecuteCommand), so a value that skipped the UI can't reach the board.
//
// Length/range filters are real checks, not common.ts's regexes: those also
// restrict the characters (MaxLength) or are only approximate (Max(100)
// accepts 999).

export type PatternValidator = {
	/** How the filter reads in a message ("MaxLength 16", "IPv4"). */
	label: string;
	test(value: string): boolean;
	message: string;
};

type SimplePattern = { regex: string; message: string };
type ParamPattern = { test: (value: string, param: number) => boolean; message: (param: number) => string };

const simple = (regex: string, message: string): SimplePattern => ({ regex, message });

/** The named filters a manifest can use, each a regex with its message. */
export const SIMPLE_PATTERNS = {
	LettersOnly: simple(common.LettersOnly(), "Letters only."),
	LowercaseLetters: simple(common.LowercaseLetters(), "Lowercase letters only."),
	UppercaseLetters: simple(common.UppercaseLetters(), "Uppercase letters only."),
	NumbersOnly: simple(common.NumbersOnly(), "Digits only."),
	Alphanumeric: simple(common.Alphanumeric(), "Letters and digits only."),
	AlphanumericUnderscore: simple(common.AlphanumericUnderscore(), "Letters, digits and _ only."),
	AlphanumericDash: simple(common.AlphanumericDash(), "Letters, digits and - only."),
	Email: simple(common.Email(), "Not a valid e-mail address."),
	Url: simple(common.Url(), "Not a valid URL."),
	PhoneNumber: simple(common.PhoneNumber(), "Not a valid phone number (7–15 digits, optional +)."),
	USPhoneNumber: simple(common.USPhoneNumber(), "Not a valid US phone number."),
	ZipCodeUS: simple(common.ZipCodeUS(), "Not a valid US ZIP code."),
	ZipCodeBR: simple(common.ZipCodeBR(), "Not a valid CEP (00000-000)."),
	HexColor: simple(common.HexColor(), "Not a hex color (#RGB or #RRGGBB)."),
	RgbColor: simple(common.RgbColor(), "Not an rgb(r, g, b) color."),
	RgbaColor: simple(common.RgbaColor(), "Not an rgba(r, g, b, a) color."),
	DateYYYYMMDD: simple(common.DateYYYYMMDD(), "Use YYYY-MM-DD."),
	DateDDMMYYYY: simple(common.DateDDMMYYYY(), "Use DD/MM/YYYY."),
	DateTimeISO: simple(common.DateTimeISO(), "Not an ISO date-time."),
	StrongPassword: simple(common.StrongPassword(), "8+ characters with upper, lower, a digit and a symbol."),
	MediumPassword: simple(common.MediumPassword(), "6+ characters with a letter and a digit."),
	UUID: simple(common.UUID(), "Not a valid UUID."),
	UUIDSimple: simple(common.UUIDSimple(), "Not a 32-digit hex UUID."),
	Base64: simple(common.Base64(), "Not valid Base64."),
	IPv4: simple(common.IPv4(), "Not a valid IPv4 address."),
	IPv6: simple(common.IPv6(), "Not a valid IPv6 address."),
	MACAddress: simple(common.MACAddress(), "Not a valid MAC address."),
	PortNumber: simple("^([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$", "Not a port (0–65535)."),
	CIDR: simple(common.CIDR(), "Not a CIDR block (a.b.c.d/n)."),
	IPPort: simple(common.IPPort(), "Not an ip:port."),
	GPIOPin: simple(common.GPIOPin(), "Not a GPIO pin (0–27)."),
	PWM: simple(common.PWM(), "Not a duty cycle (0–100)."),
	ADC10Bit: simple("^([0-9]|[1-9][0-9]{1,2}|10[01][0-9]|102[0-3])$", "Not a 10-bit ADC value (0–1023)."),
	DAC8Bit: simple("^([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$", "Not an 8-bit DAC value (0–255)."),
	I2CAddress7Bit: simple(common.I2CAddress7Bit(), "Not a 7-bit I²C address (0x00–0x7F)."),
	I2CAddress8Bit: simple(common.I2CAddress8Bit(), "Not an 8-bit I²C address (0x00–0xFF)."),
	SPIClockMHz: simple(common.SPIClockMHz(), "Not an SPI clock (0–50 MHz)."),
	UARTBaudrate: simple(common.UARTBaudrate(), "Not a standard baud rate (1200–115200)."),
	DigitalState: simple(common.DigitalState(), "0 or 1."),
	AnalogVoltage5V: simple(common.AnalogVoltage5V(), "Not a voltage between 0 and 5 V."),
	RGBValue: simple(common.RGBValue(), "Not a color channel (0–255)."),
} satisfies Record<string, SimplePattern>;

const characters = (value: string) => [...value].length;

/** The filters that take a number (`{ name: MaxLength, value: 16 }`) — real checks, not regexes. */
export const PARAM_PATTERNS = {
	MaxLength: { test: (value, max) => characters(value) <= max, message: max => `At most ${max} characters.` },
	MinLength: { test: (value, min) => characters(value) >= min, message: min => `At least ${min} characters.` },
	ExactLength: { test: (value, length) => characters(value) === length, message: length => `Exactly ${length} characters.` },
	// For "number" configs the value tested is the evaluated expression.
	Max: { test: (value, max) => value.trim() !== "" && Number(value) <= max, message: max => `At most ${max}.` },
	Min: { test: (value, min) => value.trim() !== "" && Number(value) >= min, message: min => `At least ${min}.` },
} satisfies Record<string, ParamPattern>;

/** A named filter. */
export type SimplePatternName = keyof typeof SIMPLE_PATTERNS;
/** A filter that takes a number. */
export type ParamPatternName = keyof typeof PARAM_PATTERNS;

/** Every named filter. */
export const SIMPLE_PATTERN_NAMES = Object.keys(SIMPLE_PATTERNS) as [SimplePatternName, ...SimplePatternName[]];
/** Every filter that takes a number. */
export const PARAM_PATTERN_NAMES = Object.keys(PARAM_PATTERNS) as [ParamPatternName, ...ParamPatternName[]];

/** A pattern as a manifest writes it (see PatternSchema in IConfiguration.schema.ts). */
export type PatternReference =
	| SimplePatternName
	| { name: ParamPatternName; value: number }
	| { regex: string; message?: string };

/** Whether `source` is a regex that compiles. */
export const isValidRegex = (source: string) => {
	try {
		new RegExp(source);
		return true;
	} catch {
		return false;
	}
};

const fromRegex = (label: string, source: string, message: string): PatternValidator => {
	const regex = new RegExp(source);
	return { label, message, test: value => regex.test(value) };
};

/** A pattern as written in a manifest, as a validator with its message. */
export function resolvePattern(reference: PatternReference): PatternValidator {
	if (typeof reference === "string") {
		const pattern = SIMPLE_PATTERNS[reference];
		return fromRegex(reference, pattern.regex, pattern.message);
	}
	if ("regex" in reference) {
		// Its message names it in an "any" list ("Hex bytes" or "Base64"), not "custom".
		const label = reference.message ? reference.message.replace(/\.$/, "") : "custom";
		return fromRegex(label, reference.regex, reference.message ?? `Doesn't match ${reference.regex}.`);
	}
	const pattern: ParamPattern = PARAM_PATTERNS[reference.name];
	return {
		label: `${reference.name} ${reference.value}`,
		message: pattern.message(reference.value),
		test: value => pattern.test(value, reference.value),
	};
}

/** How a config's filters combine: every one must pass (all), or one is enough (any). */
export type PatternMatch = "all" | "any";

/**
 * Why `value` fails the filters, or null when it passes. "all": every filter
 * must pass (the first failure is reported); "any": at least one must.
 * No filters, or an empty value (that's what `required` is for), always pass.
 */
export function checkPatterns(value: string, references: PatternReference[] | undefined, match: PatternMatch = "all"): string | null {
	if (!references?.length || value === "") return null;
	const validators = references.map(resolvePattern);

	if (match === "any") {
		if (validators.some(validator => validator.test(value))) return null;
		return validators.length === 1
			? validators[0]!.message
			: `Must match one of: ${validators.map(validator => validator.label).join(", ")}.`;
	}

	return validators.find(validator => !validator.test(value))?.message ?? null;
}
