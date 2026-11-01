import clsx from "clsx";
import { Radio, Zap } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { findNodeSchema, type IActionRuntime, type IComponentRuntime } from "@henglosio/workflow";

// An action's own icon (its manifest's `icon:`, a Lucide name) — loaded on
// its own, not the whole icon set; the default when it has none or the name
// isn't one of Lucide's.

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

export const ActionIcon: React.FC<ActionIconProps> = ({ icon, fallback, size = 14, className }) => {
	const name = lucideName(icon);
	if (!name) return <>{fallback}</>;
	return <DynamicIcon name={name} size={size} className={className} fallback={() => <>{fallback}</>} />;
};

type NodeMarkProps = {
	icon: string | undefined;
	/** A trigger: round and green, like its node — where a flow starts. */
	trigger: boolean;
	/** What shows without an icon of its own (a trigger's default is a radio). */
	fallback?: React.ReactNode;
	size?: number;
};

/** The small badge before a node's name in a list — the same everywhere it's listed. */
export const NodeMark: React.FC<NodeMarkProps> = ({ icon, trigger, fallback, size = 12 }) => (
	<div className={clsx(
		"flex items-center justify-center size-6 shrink-0 transition-colors",
		trigger
			? "rounded-full bg-accent-subtle border border-accent-line text-accent-fg"
			: "rounded-md bg-field border border-line-subtle text-fg-muted",
	)}>
		<ActionIcon icon={icon} size={size} fallback={fallback ?? (trigger ? <Radio size={size} /> : <Zap size={size} />)} />
	</div>
);
