import { listDrivers } from "@/shared/api";
import { getAppSocket } from "@/shared/lib/socket";
import type {
	BackendDriverConnectedOutDTO,
	BackendDriverDisconnectedOutDTO,
	DriverItem,
} from "@henglosio/shared";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { DriverConnectionAtom } from "@/features/studio/store/driver.store";

export const useDrivers = () => {
	const [drivers, setDrivers] = useState<DriverItem[]>([]);
	const [driverConnection, setDriverConnection] = useAtom(DriverConnectionAtom);
	// const selectedDriverConnection = useAtomValue(Device)

	useEffect(() => {
		const socket = getAppSocket();

		listDrivers().then(setDrivers);

		const onConnected = ({ driverId }: BackendDriverConnectedOutDTO) =>
			setDrivers((prev) =>
				prev.map((d) =>
					d.id === driverId ? { ...d, online: true } : d,
				),
			);

		const onDisconnected = ({
			driverId,
		}: BackendDriverDisconnectedOutDTO) =>
			setDrivers((prev) =>
				prev.map((d) =>
					d.id === driverId ? { ...d, online: false } : d,
				),
			);

		socket.on("driver:connected", onConnected);
		socket.on("driver:disconnected", onDisconnected);

		return () => {
			socket.off("driver:connected", onConnected);
			socket.off("driver:disconnected", onDisconnected);
		};
	}, []);

	useEffect(() => {
		if (!driverConnection) return;

		const match = drivers.find((driver) => driver.id === driverConnection.id);

		if (!match) {
			setDriverConnection(null);
			return;
		}

		if (match.online !== driverConnection.online) {
			setDriverConnection({ ...driverConnection, online: match.online });
		}
	}, [drivers, driverConnection, setDriverConnection]);

	const connectDriver = (driver: DriverItem) => setDriverConnection(driver);

	return { drivers, driverConnection, connectDriver };
};
