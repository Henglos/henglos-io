import { useEffect, useState } from "react";
import { Select } from "@henglosio/ui";
import { Field, PortSelect, Steps, type FlashFormProps } from "./common";

// The speeds esptool & co. commonly write at. The board's script has its own
// default (460800 for the ESP32): "Board default" leaves it to it.
const SPEEDS = [115200, 230400, 460800, 921600] as const;
const BOARD_DEFAULT = "default";

/**
 * A serial flash: the board's port — the firmware is written through it by the
 * board's own tool, over the driver's tunnel — and, if wanted, how fast.
 */
export const SerialFlashForm: React.FC<FlashFormProps<"serial">> = ({ last, defaultPort, devices, onChange }) => {

	const [port, setPort] = useState(last?.port ?? defaultPort);
	const [speed, setSpeed] = useState<string>(last?.baudrate ? String(last.baudrate) : BOARD_DEFAULT);

	useEffect(() => {
		onChange(port ? { method: "serial", port, ...(speed !== BOARD_DEFAULT ? { baudrate: Number(speed) } : {}) } : null);
	}, [port, speed, onChange]);

	return (
		<>
			<Steps steps={[
				"The board is put in its bootloader through its serial port.",
				"Its tool (esptool…) writes the firmware over the driver's tunnel to the port.",
				"The board restarts, and the runtime is installed through the same port.",
			]} />

			<Field label="Serial port" hint="Where the board is plugged in — it must be running, or in its bootloader.">
				<PortSelect value={port} onChange={setPort} devices={devices} />
			</Field>

			<Field label="Write speed" hint="Lower it if the write fails halfway — a long or poor USB cable.">
				<Select.Root value={speed} onValueChange={setSpeed} className="w-full">
					<Select.Trigger />
					<Select.Content>
						<Select.Item value={BOARD_DEFAULT}>Board default</Select.Item>
						{SPEEDS.map(rate => <Select.Item key={rate} value={String(rate)}>{rate.toLocaleString("en-US")} baud</Select.Item>)}
					</Select.Content>
				</Select.Root>
			</Field>
		</>
	);

};
