"use client";

import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Button, Dialog, Skeleton, Text } from "@henglosio/ui";
import { Cpu, Laptop, Link2, Plug, Unplug, Wifi } from "lucide-react";
import clsx from "clsx";
import { ActivityBar } from "@/shared/components/ActiveBar.component";
import { listDevices, listDrivers } from "@shared/api";
import { DriverCard, DEVICES_REFRESH_MS } from "./components/DriverCard.component";
import { PairDriverDialog } from "./components/PairDriverDialog.component";

type StatusFilter = "all" | "online" | "offline";

// How often the drivers' online state is re-read.
const DRIVERS_REFRESH_MS = 5000;

export const DriversFeature = () => {

	const [filter, setFilter] = useState<StatusFilter>("all");
	const [pairOpen, setPairOpen] = useState(false);

	const { data, isLoading } = useQuery({
		queryKey: ["drivers"],
		queryFn: listDrivers,
		refetchInterval: DRIVERS_REFRESH_MS,
	});

	const drivers = data ?? [];
	const online = drivers.filter(driver => driver.online);

	// Boards plugged in across the online drivers — the same queries the cards use (shared cache).
	const devices = useQueries({
		queries: online.map(driver => ({
			queryKey: ["devices", driver.id],
			queryFn: () => listDevices(driver.id),
			refetchInterval: DEVICES_REFRESH_MS,
		})),
	});
	const boards = devices.reduce((sum, query) => sum + (query.data?.length ?? 0), 0);

	const shown = drivers.filter(driver =>
		filter === "all" || (filter === "online" ? driver.online : !driver.online));

	return (

		<main className="flex w-full h-full bg-canvas overflow-hidden">

			<ActivityBar />

			<section className="w-full flex flex-col flex-1 min-h-0">

				<div className="flex justify-center w-full flex-1 min-h-0 overflow-y-auto">

					{/* h-fit: as tall as its content, so the page scrolls instead of squeezing it. */}
					<div className="w-5xl h-fit flex flex-col gap-6 p-6">

						{/* Header */}
						<div className="flex items-end gap-4 pt-6">
							<div className="flex flex-col gap-1">
								<Text variant="high" size="xl" font="sans" className="font-bold">Devices</Text>
								<Text variant="low" size="sm">
									The computers your boards plug into — each runs the Henglos IO driver.
								</Text>
							</div>

							<Dialog.Root open={pairOpen} onOpenChange={setPairOpen}>
								<Dialog.Trigger asChild>
									<Button.Root variant="primary" size="md" className="ml-auto">
										<Button.Icon><Link2 size={16} /></Button.Icon>
										<Button.Label>Pair a driver</Button.Label>
									</Button.Root>
								</Dialog.Trigger>
								<Dialog.Overlay />
								{pairOpen && <PairDriverDialog onClose={() => setPairOpen(false)} />}
							</Dialog.Root>
						</div>

						{/* Stats — also the status filter */}
						<div className="flex border border-line rounded-xl divide-x divide-line bg-panel overflow-hidden">
							<StatFilter label="Drivers" icon={<Laptop size={14} />} value={drivers.length} loading={isLoading} active={filter === "all"} onClick={() => setFilter("all")} />
							<StatFilter label="Online" icon={<Wifi size={14} />} value={online.length} loading={isLoading} active={filter === "online"} onClick={() => setFilter("online")} />
							<StatFilter label="Offline" icon={<Unplug size={14} />} value={drivers.length - online.length} loading={isLoading} active={filter === "offline"} onClick={() => setFilter("offline")} />
							<StatFilter label="Boards plugged in" icon={<Cpu size={14} />} value={boards} loading={isLoading} />
						</div>

						{/* Drivers */}
						<div className="grid gap-3 sm:grid-cols-2">

							{isLoading && Array.from({ length: 2 }, (_, i) => (
								<Skeleton key={i} className="h-44 w-full rounded-xl" />
							))}

							{shown.map(driver => <DriverCard key={driver.id} driver={driver} />)}

							{!isLoading && drivers.length === 0 && <NoDrivers onPair={() => setPairOpen(true)} />}

							{!isLoading && drivers.length > 0 && shown.length === 0 && (
								<div className="col-span-full flex items-center justify-center py-12 rounded-xl border border-dashed border-line bg-panel">
									<Text variant="dim" size="sm">{filter === "online" ? "No driver is online right now." : "Every driver is online."}</Text>
								</div>
							)}

						</div>

					</div>

				</div>

			</section>

		</main>

	);

};

// A Hub-style stat that, when clickable, filters the list.
const StatFilter: React.FC<{
	label: string;
	icon: React.ReactNode;
	value: number;
	loading: boolean;
	active?: boolean;
	onClick?: () => void;
}> = ({ label, icon, value, loading, active, onClick }) => {

	const content = (
		<>
			<div className="flex items-center text-xs">
				<Text variant={active ? "high" : "low"} size="xs" className="uppercase">{label}</Text>
				<span className={clsx("ml-auto", active ? "text-accent" : "text-fg-muted")}>{icon}</span>
			</div>
			{loading
				? <Skeleton className="h-10 w-14 rounded" />
				: <span className="text-fg text-[36px] leading-10 tabular-nums">{value}</span>}
		</>
	);

	if (!onClick) return <div className="flex flex-col gap-2 w-full px-4 py-4">{content}</div>;

	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={clsx(
				"relative flex flex-col gap-2 w-full px-4 py-4 text-left cursor-pointer transition-colors",
				active ? "bg-raised" : "hover:bg-hover",
			)}
		>
			{content}
			<span className={clsx("absolute inset-x-0 bottom-0 h-0.5 transition-colors", active ? "bg-accent" : "bg-transparent")} />
		</button>
	);

};

// First run: what a driver is, and the way to pair one.
const NoDrivers: React.FC<{ onPair: () => void }> = ({ onPair }) => (
	<div className="col-span-full flex flex-col items-center gap-4 py-16 px-6 rounded-xl border border-dashed border-line bg-panel text-center">
		<div className="flex items-center justify-center size-12 rounded-xl border border-line-subtle bg-field text-fg-muted">
			<Plug size={20} />
		</div>
		<div className="flex flex-col gap-1 max-w-md">
			<Text variant="high" size="md">No drivers yet</Text>
			<Text variant="low" size="sm">
				A driver is the computer your board is plugged into. Pair one, plug a board into it over USB,
				and it shows up here — ready to upload and run workflows.
			</Text>
		</div>
		<Button.Root variant="primary" size="md" onClick={onPair}>
			<Button.Icon><Link2 size={14} /></Button.Icon>
			<Button.Label>Pair a driver</Button.Label>
		</Button.Root>
	</div>
);
