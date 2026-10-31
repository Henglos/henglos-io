import { Affix } from "./Affix";
import { Field } from "./Field";
import { Handler } from "./Handler";
import { Label } from "./Label";
import { Prefix } from "./Prefix";
import { RootInput as Root } from "./RootInput";
import { Select } from "./Select";

/** A text input: `Root` (the box), its `Label`, `Field`, a `Prefix` / `Affix`, a `Select` and a scrubbing `Handler`. */
export const Input = {
	Root,
	Field,
	Handler,
	Label,
	Icon: Label,
	Affix,
	Prefix,
	Select,
}
