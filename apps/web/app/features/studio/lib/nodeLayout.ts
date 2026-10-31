// How an action shows on the canvas, and where it's edited:
//   "panel"   — a compact card (its name, a summary of its configs, the last
//               run); the action selected is edited in the bottom panel's
//               Inspector — Input | Settings | Output, n8n-style.
//   "sidebar" — the same compact card; edited in the right sidebar instead.
//   "inline"  — the card holds it all: configs, tabs, outputs and values
//               (ActionNodeLegacy) — the layout before the inspector.
export type NodeLayout = "panel" | "sidebar" | "inline";

export const NODE_LAYOUT = "panel" as NodeLayout;
