import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, DotStatus, Dropdown, Skeleton, Text, emitToast } from "@henglosio/ui";
import { Cpu, Ellipsis, Laptop, RefreshCw, RotateCw, Trash, Usb } from "lucide-react";
import type { DriverItem } from "@henglosio/shared";
import clsx from "clsx";
import { deleteDriver, listDevices, restartDriver } from "@shared/api";

// A board's USB-serial chip, by its USB vendor id — what the port shows up as.
const USB_CHIPS: Record<string, string> = {
	"10c4": "Silicon Labs CP210x",
	"1a86": "WCH CH340",
	"0403": "FTDI",
	"303a": "Espressif (native USB)",
	"2e8a": "Raspberry Pi",
	"067b": "Prolific PL2303",
	"2341": "Arduino",
};

export const usbChip = (vendor?: string) =>
	vendor ? USB_CHIPS[vendor.toLowerCase().replace(/^0x/, "")] ?? `USB ${vendor}` : "USB serial";

/** How often an online driver's plugged-in boards are re-read. */
export const DEVICES_REFRESH_MS = 5000;

export const DriverCard: React.FC<{ driver: DriverItem }> = ({ driver }) => {

	const queryClient = useQueryClient();

	const { data: devices, isLoading, isFetching, refetch } = useQuery({
		queryKey: ["devices", driver.id],
		queryFn: () => listDevices(driver.id),
		enabled: driver.online,
		refetchInterval: driver.online ? DEVICES_REFRESH_MS : false,
	});

	const remove = async () => {
		try {
			await deleteDriver(driver.id);
			await queryClient.invalidateQueries({ queryKey: ["drivers"] });
			emitToast("success", `Removed "${driver.name}"`);
		} catch {
			// the http interceptor already surfaces a detailed error toast
		}
	};

	// Ends whatever it runs (a Play, a REPL, a task stuck after the hosting
	// restarted) and frees its boards' ports — it reconnects by itself.
	const restart = async () => {
		try {
			await restartDriver(driver.id);
			emitToast("success", `Restarting "${driver.name}"`, { detail: "It's back online in a few seconds." });
			await queryClient.invalidateQueries({ queryKey: ["drivers"] });
		} catch {
			// the http interceptor already surfaces a detailed error toast
		}
	};

	return (

		<div
			className={clsx(
				"flex flex-col rounded-xl border bg-panel overflow-hidden transition-colors",
				driver.online ? "border-line hover:border-line-strong" : "border-line-subtle",
			)}
		>

			<div className="flex items-center gap-3 p-4">

				<div
					className={clsx(
						"relative flex items-center justify-center size-10 shrink-0 rounded-lg border",
						driver.online ? "bg-accent-subtle border-accent-line text-accent" : "bg-field border-line-subtle text-fg-muted",
					)}
				>
					<Laptop size={18} />
					<span className="absolute -right-0.5 -bottom-0.5">
						<DotStatus status={driver.online ? "success" : "disable"} />
					</span>
				</div>

				<div className="flex flex-col min-w-0 flex-1">
					<Text variant="high" size="md" className="truncate">{driver.name}</Text>
					<Text variant="low" size="xs">
						{driver.online
							? devices ? `${devices.length} device${devices.length === 1 ? "" : "s"} plugged in` : "Online"
							: "Offline — start it with hio driver start"}
					</Text>
				</div>

				<Badge variant={driver.online ? "success" : "default"}>{driver.online ? "Online" : "Offline"}</Badge>

				<Dropdown.Root>
					<Dropdown.Trigger asChild>
						<Button.Root variant="ghost" size="sm" aria-label="Driver options">
							<Button.Icon><Ellipsis size={14} /></Button.Icon>
						</Button.Root>
					</Dropdown.Trigger>
					<Dropdown.Content align="end">
						{driver.online && (
							<Dropdown.Item onClick={restart}>
								<RotateCw size={12} />
								Restart driver
							</Dropdown.Item>
						)}
						<Dropdown.Item onClick={remove}>
							<Trash size={12} />
							Remove driver
						</Dropdown.Item>
					</Dropdown.Content>
				</Dropdown.Root>

			</div>

			<div className="flex flex-col gap-2 px-4 pb-4">

				<div className="flex items-center gap-1.5">
					<Text variant="low" size="xs" font="mono" className="uppercase tracking-wide">Devices</Text>
					{driver.online && (
						<button
							type="button"
							onClick={() => refetch()}
							className="ml-auto flex items-center gap-1 text-fg-muted hover:text-fg cursor-pointer"
							title="Look for plugged-in devices again"
						>
							<RefreshCw size={11} className={clsx(isFetching && "animate-spin")} />
							<Text variant="low" size="xs">Refresh</Text>
						</button>
					)}
				</div>

				{!driver.online && (
					<div className="flex items-center gap-2 px-2.5 h-10 rounded-md border border-dashed border-line-subtle">
						<Text variant="low" size="xs">The driver isn&apos;t running, so its devices can&apos;t be seen.</Text>
					</div>
				)}

				{driver.online && isLoading && <Skeleton className="h-10 w-full rounded-md" />}

				{driver.online && devices && devices.length === 0 && (
					<div className="flex items-center gap-2 px-2.5 h-10 rounded-md border border-dashed border-line-subtle text-fg-muted">
						<Usb size={13} />
						<Text variant="low" size="xs">No devices plugged in. Connect one over USB.</Text>
					</div>
				)}

				{driver.online && devices && devices.length > 0 && (
					<div className="flex flex-col rounded-md border border-line-subtle divide-y divide-line-subtle overflow-hidden">
						{devices.map(device => (
							<div key={device.port} className="flex items-center gap-2.5 px-2.5 h-11">
								<div className="flex items-center justify-center size-6 shrink-0 rounded-md bg-field border border-line-subtle text-accent">
									<Cpu size={12} />
								</div>
								<Text variant="high" size="sm" font="mono" className="truncate">{device.port}</Text>
								<Text variant="low" size="xs" className="ml-auto truncate">{usbChip(device.usbVendor)}</Text>
							</div>
						))}
					</div>
				)}

			</div>

		</div>

	);

};
