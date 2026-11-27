import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { Device, FlashTarget } from "@henglosio/shared";

export type DriverConnection = {
	id: string;
	name: string;
	online: boolean;
};

export const DriverConnectionAtom = atom<DriverConnection | null>(null);
export const DeviceSelectionAtom = atom<Device | null>(null);
export const DevicesAtom = atom<Device[]>([]);
// `null` = follow the board's default baud rate (base.connection.serial.baudrates[0]).
// A number is an explicit override picked for this session.
export const BaurateAtom = atom<number | null>(null);

// The last flash target picked, by workflow — the flash dialog opens with it.
export const FlashTargetsAtom = atomWithStorage<Record<string, FlashTarget>>("henglosio:flash-targets", {});
