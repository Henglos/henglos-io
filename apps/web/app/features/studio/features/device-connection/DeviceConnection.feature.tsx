import { useState } from "react";
import { Popover } from "radix-ui";
import { Button, Input, Text, Tree } from "@henglosio/ui";
import type { Device } from "@henglosio/shared";
import { ChevronsUpDown, Search } from "lucide-react";
import { useAtomValue } from "jotai";
import { DriverConnectionAtom } from "@/features/studio/store/driver.store";
import { DeviceItem } from "./components/DeviceItem.component";
import { useDevices } from "./hooks/useDevices.hook";

export const DeviceConnection = () => {

	const driverConnection = useAtomValue(DriverConnectionAtom);
	const { devices, selectDevice, selectedDevice } = useDevices();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);

	const q = query.toLowerCase();
	const filteredDevices = devices.filter(device =>
		device.port.toLowerCase().includes(q) ||
		(device.usbVendor ?? "").toLowerCase().includes(q)
	);

	const onSelect = (device: Device) => {
		selectDevice(selectedDevice?.port === device.port ? null : device);
		setOpen(false);
	};

	return (

		<Popover.Root open={open} onOpenChange={setOpen}>

			<Popover.Trigger asChild>
				<Button.Root variant="ghost" className="gap-2 px-2" disabled={!driverConnection}>
					<Button.Label>
						<Text variant="dim" size="xs" font="mono" className="max-w-28 truncate">
							{selectedDevice?.port ?? "Select device"}
						</Text>
					</Button.Label>
					<Button.Icon>
						<ChevronsUpDown size={12} />
					</Button.Icon>
				</Button.Root>
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Content
					align="start"
					sideOffset={6}
					className="z-50 w-64 max-h-80 flex flex-col gap-2 bg-overlay border border-line rounded-lg overflow-hidden p-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1"
				>

					<Input.Root>
						<Input.Icon>
							<Search size={14} />
						</Input.Icon>
						<Input.Field
							placeholder="Search devices..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</Input.Root>

					<Tree.Root className="flex-1 overflow-y-auto">

						{!driverConnection ? (
							<div className="px-4 py-2">
								<Text variant="low" size="xs">No driver connected.</Text>
							</div>
						) : filteredDevices.length === 0 ? (
							<div className="px-4 py-2">
								<Text variant="low" size="xs">No devices found.</Text>
							</div>
						) : (
							filteredDevices.map(device => (
								<DeviceItem
									key={device.port}
									device={device}
									selected={selectedDevice?.port === device.port}
									onSelect={onSelect}
								/>
							))
						)}

					</Tree.Root>

				</Popover.Content>
			</Popover.Portal>

		</Popover.Root>

	);

};
