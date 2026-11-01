import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import type { Device } from "@henglosio/shared";
import { getAppSocket } from "@/shared/lib/socket";
import {
	DevicesAtom,
	DeviceSelectionAtom,
	DriverConnectionAtom,
} from "@/features/studio/store/driver.store";
import { listDevices } from "@/shared/api";

export const useDevices = () => {
	const driverConnection = useAtomValue(DriverConnectionAtom);
	const devices = useAtomValue(DevicesAtom);
	const setDevices = useSetAtom(DevicesAtom);
	const [selectedDevice, setSelected] = useAtom(DeviceSelectionAtom);

	const driverId = driverConnection?.id ?? null;
	const driverOnline = driverConnection?.online ?? false;

	useEffect(() => {
		// The devices endpoint proxies to the driver daemon, so it only works
		// while the driver is online — otherwise the backend rejects with
		// "O driver está offline.".
		if (!driverId || !driverOnline) {
			setDevices([]);
			setSelected(null);
			return;
		}

		listDevices(driverId).then(setDevices).catch(() => setDevices([]));

		const socket = getAppSocket();

		const onConnected = (device: Device) => setDevices((prev) => prev.some((d) => d.port === device.port) ? prev : [...prev, device]);
		const onDisconnected = (device: Device) => setDevices((prev) => prev.filter((d) => d.port !== device.port));

		socket.on("device:connected", onConnected);
		socket.on("device:disconnected", onDisconnected);

		return () => {
			socket.off("device:connected", onConnected);
			socket.off("device:disconnected", onDisconnected);
			setDevices([]);
		};
	}, [driverId, driverOnline, setDevices, setSelected]);

	const selectDevice = (device: Device | null) => setSelected(device);

	return { devices, selectedDevice, selectDevice };

};
