import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import type { BackendDriverDisconnectedOutDTO, BackendDriverSyncOutDTO } from "@henglosio/shared";
import { getAppSocket } from "@shared/lib/socket";
import { DriverConnectionAtom } from "../store/driver.store";
import { DriverSyncAtom } from "../store/activity.store";

/**
 * Follows the workflow sync of the driver in use (`driver:sync`, from the
 * hosting when a driver connects) into DriverSyncAtom — any driver's while
 * none is picked yet. One that goes offline mid-sync won't answer: dropped.
 */
export const useDriverSync = () => {

	const driver = useAtomValue(DriverConnectionAtom);
	const setSync = useSetAtom(DriverSyncAtom);

	useEffect(() => {

		const socket = getAppSocket();
		const ours = (driverId: string) => !driver || driver.id === driverId;

		const onSync = (event: BackendDriverSyncOutDTO) => {
			if (ours(event.driverId)) setSync({ ...event, at: Date.now() });
		};
		const onDisconnected = ({ driverId }: BackendDriverDisconnectedOutDTO) => {
			setSync(prev => prev?.driverId === driverId && prev.state === "syncing" ? null : prev);
		};

		socket.on("driver:sync", onSync);
		socket.on("driver:disconnected", onDisconnected);
		return () => {
			socket.off("driver:sync", onSync);
			socket.off("driver:disconnected", onDisconnected);
		};

	}, [driver, setSync]);
};
