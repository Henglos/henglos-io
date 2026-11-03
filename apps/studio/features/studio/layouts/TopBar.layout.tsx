import { ExecutionControllers } from "../features/execution-controllers/ExecutionControllers.feature";
import { BoardStatus } from "../features/execution-controllers/BoardStatus.component";
import { WorkflowStats } from "../features/workflow-stats/WorkflowStats.feature";
import { DriverConnection } from "../features/driver-connection/DriverConnection.feature";
import { DeviceConnection } from "../features/device-connection/DeviceConnection.feature";
import { BaudrateConnection } from "../features/baurate-connection/BaudrateConnection.feature";
import { HistoryControls } from "../features/collaboration/HistoryControls.feature";
import { CollabPeers } from "../features/collaboration/CollabPeers.feature";

export const TopBarLayout = () => {

	return (

		<aside className="relative flex items-center w-full h-10 p-2 bg-chrome border-b border-line">

			<ExecutionControllers />

			<div className="h-4 w-px mx-2 bg-line" />

			<HistoryControls />

			{/* Centered on the bar itself, whatever the two sides hold. */}
			<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
				<BoardStatus />
			</div>

			{/* <WorkflowStats className="ml-auto"/> */}

			<div className="flex items-center gap-2 px-2 ml-auto">
				<CollabPeers />
				<DriverConnection />
				<DeviceConnection />
				<BaudrateConnection />
			</div>

		</aside>

	);

}
