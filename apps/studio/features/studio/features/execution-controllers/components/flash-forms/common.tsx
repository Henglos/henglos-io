import { Select, Text } from "@henglosio/ui";
import type { Device, FlashMethodName, FlashTarget } from "@henglosio/shared/browser";

/** A flash target of one method. */
export type TargetOf<K extends FlashMethodName> = Extract<FlashTarget, { method: K }>;

/** What each method's form gets from the flash dialog. */
export type FlashFormProps<K extends FlashMethodName> = {

	driverId: string;
	/** The last target of this method for the workflow — the form opens with it. */
	last: TargetOf<K> | undefined;
	/** The port picked last, or the toolbar's board. */
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

type PortSelectProps = {
	value: string;
	onChange: (port: string) => void;
	devices: Device[];
};

/** The board's serial port, among those on the driver's machine. */
export const PortSelect: React.FC<PortSelectProps> = ({ value, onChange, devices }) => {
	// The port picked before may be unplugged now: still offered, so it can be kept.
	const ports = [...new Set([...devices.map(device => device.port), ...(value ? [value] : [])])];
	const vendor = (port: string) => devices.find(device => device.port === port)?.usbVendor;

	return (
		<Select.Root value={value} onValueChange={onChange} className="w-full">
			<Select.Trigger placeholder={ports.length ? "Pick the board's port" : "No board plugged in"} />
			<Select.Content>
				{ports.map(port => (
					<Select.Item key={port} value={port}>
						{port}{vendor(port) ? ` · ${vendor(port)}` : ""}{devices.some(device => device.port === port) ? "" : " · not plugged in"}
					</Select.Item>
				))}
			</Select.Content>
		</Select.Root>
	);
};
