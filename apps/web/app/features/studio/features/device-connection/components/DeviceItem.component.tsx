import { Button, Text, Tree } from "@henglosio/ui";
import type { Device } from "@henglosio/shared";
import clsx from "clsx";
import { Plug, Usb } from "lucide-react";

type DeviceItemProps = {
	device:   Device;
	selected: boolean;
	onSelect: (device: Device) => void;
};

export const DeviceItem: React.FC<DeviceItemProps> = ({ device, selected, onSelect }) => {

	return (

		<div className={clsx(
						"flex items-center gap-2 px-2 py-2 border-transparent hover:border-line-strong hover:bg-hover rounded-sm cursor-pointer",
						selected && "border-accent! hover:border-accent-hover!",
					)}
					onClick={() => onSelect(device)}
				>

			<Tree.Icon className="text-fg-muted">
				<Usb size={14} />
			</Tree.Icon>

			<Text variant="dim" size="sm" className="font-mono">{device.port}</Text>

			{device.usbVendor && (
				<Text variant="low" size="sm" className="ml-auto truncate group-hover/row:hidden">
					{device.usbVendor}
				</Text>
			)}


		</div>

	);

};
