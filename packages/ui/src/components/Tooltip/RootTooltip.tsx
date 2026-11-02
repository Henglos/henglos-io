import React from "react";
import { Tooltip } from "radix-ui";

export interface ProviderProps extends React.ComponentProps<typeof Tooltip.Provider> {}
export interface RootTooltipProps extends React.ComponentProps<typeof Tooltip.Root> {}

/** Shares the tooltips' timing — once, around the app. */
export const Provider: React.FC<ProviderProps> = Tooltip.Provider;
/** One tooltip — whether it's open. */
export const RootTooltip: React.FC<RootTooltipProps> = Tooltip.Root;
