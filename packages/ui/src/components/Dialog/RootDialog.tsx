import React from "react";
import { Dialog } from "radix-ui";

export interface RootDialogProps extends React.ComponentProps<typeof Dialog.Root> {}

/** The dialog — whether it's open. */
export const RootDialog: React.FC<RootDialogProps> = Dialog.Root;
