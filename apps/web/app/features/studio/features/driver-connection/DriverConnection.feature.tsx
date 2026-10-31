import { useState } from "react";
import { Popover } from "radix-ui";
import { Button, DotStatus, Input, Text, Tree } from "@henglosio/ui";
import { ChevronsUpDown, Search } from "lucide-react";
import { DriverItem } from "./components/DriverItem.component";
import { useDrivers } from "./hooks/useDrivers.hook";

export const DriverConnection = () => {

	const { drivers, driverConnection, connectDriver } = useDrivers();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);

	const q = query.toLowerCase();
	const filteredDrivers = drivers.filter(driver => driver.name.toLowerCase().includes(q));

	const onSelect = (driver: { id: string; name: string; online: boolean }) => {
		connectDriver(driver);
		setOpen(false);
	};

	return (

		<Popover.Root open={open} onOpenChange={setOpen}>

			<Popover.Trigger asChild>
				<Button.Root variant="ghost" className="gap-2 px-2">
					<DotStatus status={driverConnection?.online ? "success" : "disable"} />
					<Button.Label>
						<Text variant="dim" size="xs" font="mono" className="max-w-28 truncate">
							{driverConnection?.name ?? "Select driver"}
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
							placeholder="Search drivers..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</Input.Root>

					<Tree.Root className="flex-1 overflow-y-auto">

						{filteredDrivers.length === 0 && (
							<div className="px-4 py-2">
								<Text variant="low" size="xs">No drivers found.</Text>
							</div>
						)}

						{filteredDrivers.map(driver => (
							<DriverItem
								key={driver.id}
								id={driver.id}
								name={driver.name}
								online={driver.online}
								connected={driverConnection?.id === driver.id}
								onConnect={onSelect}
							/>
						))}

					</Tree.Root>

				</Popover.Content>
			</Popover.Portal>

		</Popover.Root>

	);

}
