import { Select, Text } from "@henglosio/ui";
import type { Device, FlashMethodName, FlashTarget } from "@henglosio/shared/browser";

/** A flash target of one method. */
export type TargetOf<K extends FlashMethodName> = Extract<FlashTarget, { method: K }>;

/** What each method's form gets from the flash dialog. */
export type FlashFormProps<K extends FlashMethodName> = {

	driverId: string;
	/** The last target of this method for the workflow — the form opens with it. */
	last: TargetOf<K> | undefined;
	/** The port picked last (by any method), or the toolbar's board. */
	defaultPort: string;
	/** The boards plugged into the driver's machine. */
	devices: Device[];
	/** The target as the form has it — null while it isn't complete. */
	onChange: (target: TargetOf<K> | null) => void;

};

type FieldProps = {
	label: string;
	hint?: React.ReactNode;
	/** Next to the label: a button of the field's. */
	action?: React.ReactNode;
	children: React.ReactNode;
};

/** A labelled field of a flash form. */
export const Field: React.FC<FieldProps> = ({ label, hint, action, children }) => (
	<div className="flex flex-col gap-1.5">
		<div className="flex items-center min-h-6">
			<Text variant="dim" size="xs">{label}</Text>
			{action}
		</div>
		{children}
		{hint && <Text variant="low" size="xs">{hint}</Text>}
	</div>
);

/** What happens when Flash is pressed, step by step. */
export const Steps: React.FC<{ steps: React.ReactNode[] }> = ({ steps }) => (
	<ol className="flex flex-col gap-2 rounded-md border border-line-subtle bg-raised/40 p-3">
		{steps.map((step, i) => (
			<li key={i} className="flex items-start gap-2">
				<span className="flex items-center justify-center size-4 shrink-0 rounded-full bg-active text-[10px] font-mono text-fg-muted mt-px">{i + 1}</span>
				<Text variant="low" size="xs">{step}</Text>
			</li>
		))}
	</ol>
);

// The Select's value for "no port" (a Select item can't be "").
const NO_PORT = "__none__";

type PortSelectProps = {
	value: string;
	onChange: (port: string) => void;
	devices: Device[];
	/** The text of a "no port" choice — absent: a port must be picked. */
	none?: string;
};

/** The board's serial port, among those on the driver's machine. */
export const PortSelect: React.FC<PortSelectProps> = ({ value, onChange, devices, none }) => {
	// The port picked before may be unplugged now: still offered, so it can be kept.
	const ports = [...new Set([...devices.map(device => device.port), ...(value ? [value] : [])])];
	const vendor = (port: string) => devices.find(device => device.port === port)?.usbVendor;

	return (
		<Select.Root value={value || (none ? NO_PORT : "")} onValueChange={next => onChange(next === NO_PORT ? "" : next)} className="w-full">
			<Select.Trigger placeholder={ports.length ? "Pick the board's port" : "No board plugged in"} />
			<Select.Content>
				{none && <Select.Item value={NO_PORT}>{none}</Select.Item>}
				{ports.map(port => (
					<Select.Item key={port} value={port}>
						{port}{vendor(port) ? ` · ${vendor(port)}` : ""}{devices.some(device => device.port === port) ? "" : " · not plugged in"}
					</Select.Item>
				))}
			</Select.Content>
		</Select.Root>
	);
};
