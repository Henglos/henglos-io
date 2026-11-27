import { FlashMethodNameSchema, type FlashMethodName } from "@henglosio/shared/browser";

/** Every way a firmware can be written — a board's are offered, the rest shown disabled. */
export const ALL_FLASH_METHODS: readonly FlashMethodName[] = FlashMethodNameSchema.options;

/** How each method is named and explained in the studio. */
// `hint`: a line, for the toolbar's menu; `description`: the whole of it, for the dialog.
export const FLASH_METHODS: Record<FlashMethodName, { label: string; hint: string; description: string }> = {
	serial: {
		label: "Serial",
		hint: "Through the board's serial port",
		description: "Written through the board's serial port, by its own tool (esptool…) — the board is put in its bootloader through the port.",
	},
	uf2: {
		label: "UF2",
		hint: "Copied to the bootloader's drive",
		description: "Copied to the drive the board shows in its bootloader (RPI-RP2…) — like dragging the file onto it.",
	},
};
