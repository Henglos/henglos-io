import { GitBranch, Repeat, Split } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { findNodeSchema, type IActionRuntime, type IComponentRuntime } from "@henglosio/workflow";

// An action's own icon (its manifest's `icon:`, a Lucide name) — loaded on
// its own, not the whole icon set; the default when it has none or the name
// isn't one of Lucide's. Same as the studio's.

const NAMES = new Set<string>(iconNames);

/** `icon` as Lucide names it ("ThermometerSun", "thermometer_sun" -> "thermometer-sun") — null when it isn't one. */
export const lucideName = (icon: string | undefined): IconName | null => {
	if (!icon?.trim()) return null;
	const name = icon.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
	return NAMES.has(name) ? name as IconName : null;
};

/**
 * The icon of a node: its component's schema first (an `icon:` added to the
 * manifest after the node was placed still shows), then the schema it was
 * created with.
 */
export const nodeIcon = (component: Pick<IComponentRuntime, "base"> | undefined, action: Pick<IActionRuntime, "base">): string | undefined =>
	(component?.base ? findNodeSchema(component as IComponentRuntime, action.base.displayName)?.icon : undefined) ?? action.base.icon;

type ActionIconProps = {
	icon: string | undefined;
	/** What shows without one. */
	fallback: React.ReactNode;
	size?: number;
	className?: string;
};

/** A node's icon — a Lucide icon by its name (see lucideName), or `fallback` when it isn't one. */
export const ActionIcon: React.FC<ActionIconProps> = ({ icon, fallback, size = 14, className }) => {
	const name = lucideName(icon);
	if (!name) return <>{fallback}</>;
	return <DynamicIcon name={name} size={size} className={className} fallback={() => <>{fallback}</>} />;
};

/** The Logic actions read as flow, not hardware — their own icon. */
export const LogicIcon: React.FC<{ action: string; size?: number }> = ({ action, size = 14 }) => {
	const Icon = action === "Repeat" ? Repeat : action === "Switch" ? Split : GitBranch;
	return <Icon size={size} className="shrink-0 text-accent-fg" />;
};
