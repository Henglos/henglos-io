import { atom } from "jotai";
import type { BackendDriverSyncOutDTO } from "@henglosio/shared";

/** The last workflow sync of the driver in use (`driver:sync`), and when it arrived. */
export type DriverSync = BackendDriverSyncOutDTO & { at: number };

export const DriverSyncAtom = atom<DriverSync | null>(null);
