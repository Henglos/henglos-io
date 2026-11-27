import { FlashMethodNameSchema, type FlashMethodName } from "@henglosio/shared/browser";

/** Every way a firmware can be written — a board's are offered, the rest shown disabled. */
export const ALL_FLASH_METHODS: readonly FlashMethodName[] = FlashMethodNameSchema.options;

/** How each method is named and explained in the studio. */
export const FLASH_METHODS: Record<FlashMethodName, { label: string; description: string }> = {
	serial: {
		label: "Serial",
		description: "Written through the board's serial port, by its own tool (esptool…) — the board is put in its bootloader through the port.",
	},
	uf2: {
		label: "UF2",
		description: "Copied to the drive the board shows in its bootloader (RPI-RP2…) — like dragging the file onto it.",
	},
};
