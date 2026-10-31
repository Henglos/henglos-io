import React from "react";
import type { WorkflowDetail } from "@shared/types/workflow.types";
import { Field, ReadValue, SectionTitle } from "./shared";

export const ConnectionSection: React.FC<{ workflow: WorkflowDetail }> = ({ workflow }) => {
	const conn = workflow.data.board.base.connection;
	return (
		<div className="flex flex-col gap-2">
			{conn.serial && (
				<>
					<SectionTitle>Serial</SectionTitle>
					<Field label="Supported Baud Rates">
						<div className="flex flex-wrap gap-2 mt-0.5">
							{conn.serial.baudrates.map(rate => (
								<span
									key={rate}
									className="text-xs font-mono px-2 py-0.5 rounded bg-overlay text-fg-muted border border-line"
								>
									{rate}
								</span>
							))}
						</div>
					</Field>
				</>
			)}

			{conn.wifi && (
				<div className={conn.serial ? "border-t border-line pt-6 flex flex-col gap-6" : "flex flex-col gap-6"}>
					<SectionTitle>Wi-Fi</SectionTitle>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Default SSID">
							<ReadValue value={conn.wifi.defaultSsid} mono />
						</Field>
						<Field label="Default Host">
							<ReadValue value={conn.wifi.defaultHost} mono />
						</Field>
						<Field label="Default Port">
							<ReadValue value={String(conn.wifi.defaultPort)} mono />
						</Field>
					</div>
				</div>
			)}
		</div>
	);
};
