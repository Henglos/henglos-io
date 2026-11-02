import React from "react";
import { DropdownMenu } from "radix-ui";

export interface RootDropdownProps extends React.ComponentProps<typeof DropdownMenu.Root> {}

/** The dropdown — whether it's open. */
export const RootDropdown: React.FC<RootDropdownProps> = DropdownMenu.Root;
