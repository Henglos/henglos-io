import React from "react";
import { Dialog } from "radix-ui";

export interface CloseProps extends React.ComponentProps<typeof Dialog.Close> {}

/** Closes the dialog (wraps a button). */
export const Close: React.FC<CloseProps> = Dialog.Close;
