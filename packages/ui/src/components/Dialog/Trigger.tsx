import React from "react";
import { Dialog } from "radix-ui";

export interface TriggerProps extends React.ComponentProps<typeof Dialog.Trigger> {}

/** Opens the dialog (wraps a button). */
export const Trigger: React.FC<TriggerProps> = Dialog.Trigger;
