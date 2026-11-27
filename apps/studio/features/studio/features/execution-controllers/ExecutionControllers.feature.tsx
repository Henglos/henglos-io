import { Button, Text } from "@henglosio/ui";
import { Bug, Hammer, Loader2, Play, Square, StepForward, Zap } from "lucide-react";
import clsx from "clsx";
import { useAtomValue, useSetAtom } from "jotai";
import { WorkflowAtom } from "../../store/workflow.store";
import { DeviceSelectionAtom, DriverConnectionAtom } from "../../store/driver.store";
import { ActiveTaskIdAtom } from "../../store/logs.store";
import { compileWorkflow, flashWorkflow, recordWorkflow } from "@/shared/api";
import { useWorkflowAutoSave } from "../../hooks/useWorkflowAutoSave";
import { useBaudrate } from "../baurate-connection/hooks/useBaurate.hook";
import { useDebugger } from "../../hooks/useDebugger";
import { useSelectedAction } from "../../hooks/useSelectedAction";
import { isTriggerAction } from "@henglosio/workflow";
import type { FlashTarget } from "@henglosio/shared";
import { useState } from "react";
import { FlashDialog } from "./components/FlashDialog.component";

export const ExecutionControllers = () => {

	const workflow = useAtomValue(WorkflowAtom);
	const driverConnection = useAtomValue(DriverConnectionAtom);
	const selectedDevice = useAtomValue(DeviceSelectionAtom);
	const { selectedBaudrate } = useBaudrate();
	const setActiveTaskId = useSetAtom(ActiveTaskIdAtom);
	// Compile/Flash/Record all read the workflow back from the backend — flush()
	// makes sure an edit still sitting in the autosave debounce actually lands
	// first, otherwise these operate on whatever was last saved, not what's on
	// screen (e.g. a Record right after an edit would burn the previous version).
	const { flush } = useWorkflowAutoSave();
	const debug = useDebugger();
	// A trigger selected on the canvas: Debug runs only its branch (listens for
	// it) — otherwise the flow from Start.
	const { action: selected } = useSelectedAction();
	const entry = selected && isTriggerAction(selected) && !selected.disabled ? selected : null;

	const onCompileHandler = async () => {
		if (!workflow || !driverConnection) return;
		await flush();
		const taskId = await compileWorkflow(driverConnection.id, workflow.id);
		setActiveTaskId(taskId);
	};

	// The flash dialog — where and how to write the board's firmware.
	const [flashOpen, setFlashOpen] = useState(false);
	const onFlash = async (target: FlashTarget) => {
		if (!workflow || !driverConnection) return;
		await flush();
		const taskId = await flashWorkflow(driverConnection.id, workflow.id, target);
		setActiveTaskId(taskId);
	};

	const onRecordHandler = async () => {
		if (!workflow || !driverConnection || !selectedDevice || !selectedBaudrate) return;
		await flush();
		const taskId = await recordWorkflow(driverConnection.id, workflow.id, selectedDevice.port, selectedBaudrate);
		setActiveTaskId(taskId);
	};

	return (

		<div className="flex items-center gap-0.5 px-4">

			<Button.Root variant="ghost" disabled={!workflow || !driverConnection} onClick={onCompileHandler}>
				<Button.Icon>
					<Hammer size={14} />
				</Button.Icon>
			</Button.Root>

			<Button.Root variant="ghost" disabled={!workflow || !driverConnection} onClick={() => setFlashOpen(true)} title="Flash — write the board's firmware and install the runtime">
				<Button.Icon>
					<Zap size={14} />
				</Button.Icon>
			</Button.Root>

			{flashOpen && workflow && driverConnection && (
				<FlashDialog
					workflowId={workflow.id}
					driverId={driverConnection.id}
					methods={workflow.data.board.base.flashMethods ?? ["serial"]}
					baudrate={selectedBaudrate}
					onClose={() => setFlashOpen(false)}
					onFlash={onFlash}
				/>
			)}

			<Button.Root variant="ghost" disabled={!workflow || !driverConnection || !selectedDevice} onClick={onRecordHandler}>
				<Button.Icon>
					<Play size={14} />
				</Button.Icon>
			</Button.Root>

			{/* Debug mode — the flow one action at a time; Continue / Stop drive it. */}
			<div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-line-subtle">

				<Button.Root
					variant="ghost"
					onClick={async () => { await flush(); await debug.start(entry?.id); }}
					disabled={!workflow || !!debug.unavailable || !!debug.session}
					title={debug.unavailable ?? (debug.session ? "Debugging" : entry
						? `Debug "${entry.alias}" — wait for it to fire, then step through its branch only`
						: "Debug from Start — run the flow one action at a time (select a trigger to debug only its branch)")}
					className={clsx(debug.session && "bg-accent-subtle!")}
				>
					<Button.Icon>
						<Bug size={14} className={clsx(debug.session && "text-accent-fg")} />
					</Button.Icon>
				</Button.Root>

				<Button.Root
					variant="ghost"
					onClick={debug.next}
					disabled={!debug.active || debug.session?.busy}
					title="Continue — run the next action"
				>
					<Button.Icon>
						{debug.session?.busy ? <Loader2 size={14} className="animate-spin" /> : <StepForward size={14} />}
					</Button.Icon>
				</Button.Root>

				<Button.Root
					variant="ghost"
					onClick={debug.stop}
					disabled={!debug.session}
					title="Stop debugging"
				>
					<Button.Icon>
						<Square size={12} />
					</Button.Icon>
				</Button.Root>

				{debug.listening ? (
					<Text variant="low" size="xs" className="pl-1 text-accent-fg! animate-pulse">listening…</Text>
				) : debug.session && (
					<Text variant="low" size="xs" className="tabular-nums pl-1">step {debug.session.state.step}</Text>
				)}

			</div>

		</div>

	);

}
