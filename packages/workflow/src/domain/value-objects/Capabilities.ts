import zod from "zod";

// What a board's hardware offers beyond its pins — a radio, a bus controller —
// and what a component needs of it to run (its manifest's
// dependences.capabilities). A closed list, so a typo in a manifest is an
// error instead of a component nothing ever runs on. Buses wired to pins
// (i2c, spi, uart) aren't here: the board's pins say those (filterBy).
export const CAPABILITIES = ["wifi", "bluetooth", "ethernet", "can", "usb-host"] as const;

/** One of CAPABILITIES. */
export const CapabilitySchema = zod.enum(CAPABILITIES);

/** One of CAPABILITIES. */
export type ICapability = zod.infer<typeof CapabilitySchema>;
