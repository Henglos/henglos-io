import type { FlashMethodName } from "@henglosio/shared/browser";
import type { FlashFormProps } from "./common";
import { SerialFlashForm } from "./SerialFlashForm.component";
import { UF2FlashForm } from "./UF2FlashForm.component";

export type { FlashFormProps, TargetOf } from "./common";

/** Each method's form in the flash dialog — a new method needs one here. */
export const FLASH_FORMS: { [K in FlashMethodName]: React.FC<FlashFormProps<K>> } = {
	serial: SerialFlashForm,
	uf2: UF2FlashForm,
};
