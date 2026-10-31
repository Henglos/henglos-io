
/** Letters, digits and _, at most `max` of them. */
export const MaxLength = (max: number): string => `^[A-Za-z0-9_]{1,${max}}$`;
/** Letters, digits and _, at least `min` of them. */
export const MinLength = (min: number): string => `^[A-Za-z0-9_]{${min},}$`;
/** Letters, digits and _, exactly `len` of them. */
export const ExactLength = (len: number): string => `^[A-Za-z0-9_]{${len}}$`;
/** A whole number up to about `max` (approximate — see PARAM_PATTERNS.Max for the real check). */
export const Max = (max: number): string => `^(?:0|[1-9][0-9]{0,${max.toString().length - 1}}|${max})$`;
/** A whole number from about `min` (approximate — see PARAM_PATTERNS.Min for the real check). */
export const Min = (min: number): string => `^([${min}-9][0-9]*)$`;
/** Letters only. */
export const LettersOnly = (): string => '^[A-Za-z]+$';
/** Lowercase letters only. */
export const LowercaseLetters = (): string => '^[a-z]+$';
/** Uppercase letters only. */
export const UppercaseLetters = (): string => '^[A-Z]+$';
/** Digits only. */
export const NumbersOnly = (): string => '^[0-9]+$';
/** Letters and digits. */
export const Alphanumeric = (): string => '^[A-Za-z0-9]+$';
/** Letters, digits and _. */
export const AlphanumericUnderscore = (): string => '^[A-Za-z0-9_]+$';
/** Letters, digits and -. */
export const AlphanumericDash = (): string => '^[A-Za-z0-9\\-]+$';
/** An email address. */
export const Email = (): string => '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$';
/** A web address (http(s):// optional). */
export const Url = (): string => '^(https?:\\/\\/)?([\\w\\-]+\\.)+[\\w\\-]+(\\/\\S*)?$';
/** A phone number: 7 to 15 digits, + optional. */
export const PhoneNumber = (): string => '^\\+?[0-9]{7,15}$';
/** A US phone number. */
export const USPhoneNumber = (): string => '^\\(?\\d{3}\\)?[- ]?\\d{3}[- ]?\\d{4}$';
/** A US ZIP code (12345 or 12345-6789). */
export const ZipCodeUS = (): string => '^\\d{5}(-\\d{4})?$';
/** A Brazilian CEP (12345-678). */
export const ZipCodeBR = (): string => '^\\d{5}-\\d{3}$';
/** A hex color (#fff or #ffffff). */
export const HexColor = (): string => '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$';
/** An rgb(r, g, b) color. */
export const RgbColor = (): string => '^rgb\\((\\d{1,3}),\\s*(\\d{1,3}),\\s*(\\d{1,3})\\)$';
/** An rgba(r, g, b, a) color. */
export const RgbaColor = (): string => '^rgba\\((\\d{1,3}),\\s*(\\d{1,3}),\\s*(\\d{1,3}),\\s*(0|0?\\.\\d+|1)\\)$';
/** A date as YYYY-MM-DD. */
export const DateYYYYMMDD = (): string => '^\\d{4}-\\d{2}-\\d{2}$';
/** A date as DD/MM/YYYY. */
export const DateDDMMYYYY = (): string => '^\\d{2}/\\d{2}/\\d{4}$';
/** An ISO 8601 date and time. */
export const DateTimeISO = (): string => '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z?$';
/** 8+ characters with a lowercase, an uppercase, a digit and a symbol. */
export const StrongPassword = (): string => '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*])[A-Za-z\\d!@#$%^&*]{8,}$';
/** 6+ letters and digits, with at least one of each. */
export const MediumPassword = (): string => '^(?=.*[a-zA-Z])(?=.*\\d)[A-Za-z\\d]{6,}$';
/** A UUID (with dashes). */
export const UUID = (): string => '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
/** Base64. */
export const Base64 = (): string => '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$';
/** A UUID without dashes. */
export const UUIDSimple = (): string => '^[0-9a-fA-F]{32}$'; 
/** An IPv4 address. */
export const IPv4 = (): string => '^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$';
/** A full IPv6 address (no :: shorthand). */
export const IPv6 = (): string => '^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$';
/** A MAC address (: or - separated). */
export const MACAddress = (): string => '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$';
/** A port number (1 to 5 digits). */
export const PortNumber = (): string => '^([0-9]{1,5})$'; 
/** An IPv4 range in CIDR notation (10.0.0.0/8). */
export const CIDR = (): string => '^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}/([0-9]|[1-2][0-9]|3[0-2])$';
/** An IPv4 address with a port (10.0.0.1:80). */
export const IPPort = (): string => '^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}:(\\d{1,5})$';
/** A GPIO number, 0 to 27. */
export const GPIOPin = (): string => '^([0-9]|1[0-9]|2[0-7])$';
/** A PWM duty, 0 to 100. */
export const PWM = (): string => '^(100|[1-9]?[0-9])$';
/** A 10-bit ADC reading. */
export const ADC10Bit = (): string => '^([0-9]|[1-9][0-9]{1,2}|10[0-2][0-3]?)$';
/** An 8-bit DAC value. */
export const DAC8Bit = (): string => '^([0-9]|[1-9][0-9]?|2[0-5][0-5]?)$';
/** A 7-bit I2C address, in hex (0x3C). */
export const I2CAddress7Bit = (): string => '^0x[0-7][0-9A-Fa-f]$';
/** An 8-bit I2C address, in hex. */
export const I2CAddress8Bit = (): string => '^0x([0-7][0-9A-Fa-f]|[0-9A-Fa-f]{2})$';
/** An SPI clock, 0 to 50 MHz. */
export const SPIClockMHz = (): string => '^([0-9]|[1-4][0-9]|50)$';
/** A common UART baud rate (1200 to 115200). */
export const UARTBaudrate = (): string => '^(1200|2400|4800|9600|19200|38400|57600|115200)$';
/** A digital state: 0 or 1. */
export const DigitalState = (): string => '^[01]$';
/** A voltage from 0 to 5 V, up to two decimals. */
export const AnalogVoltage5V = (): string => '^([0-4](\\.\\d{1,2})?|5(\\.0{1,2})?)$';
/** One RGB channel, 0 to 255. */
export const RGBValue = (): string => '^([0-9]|[1-9][0-9]?|1[0-9]{2}|2[0-4][0-9]|25[0-5])$';
