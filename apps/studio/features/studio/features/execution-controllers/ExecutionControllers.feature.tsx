import { Button, Dropdown, Text } from "@henglosio/ui";
import { Bug, Check, ChevronDown, Hammer, Loader2, Play, Square, StepForward, Zap } from "lucide-react";
import clsx from "clsx";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { WorkflowAtom } from "../../store/workflow.store";
import { DeviceSelectionAtom, DriverConnectionAtom, FlashMethodsAtom } from "../../store/driver.store";
import { ActiveTaskIdAtom } from "../../store/logs.store";
import { compileWorkflow, flashWorkflow, recordWorkflow } from "@/shared/api";
import { useWorkflowAutoSave } from "../../hooks/useWorkflowAutoSave";
import { useBaudrate } from "../baurate-connection/hooks/useBaurate.hook";
import { useDebugger } from "../../hooks/useDebugger";
import { useSelectedAction } from "../../hooks/useSelectedAction";
import { isTriggerAction } from "@henglosio/workflow";
import type { FlashMethodName, FlashTarget } from "@henglosio/shared";
import { useState } from "react";
import { FlashDialog } from "./components/FlashDialog.component";
import { ALL_FLASH_METHODS, FLASH_METHODS } from "./flashMethods";

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

	// How Flash writes the board: picked next to it, kept by workflow — the
	// board's first way when none is (or the one picked isn't the board's).
	const boardMethods: FlashMethodName[] = workflow?.data.board.base.flashMethods ?? ["serial"];
	const [flashMethods, setFlashMethods] = useAtom(FlashMethodsAtom);
	const picked = workflow ? flashMethods[workflow.id] : undefined;
	const flashMethod: FlashMethodName = picked && boardMethods.includes(picked) ? picked : boardMethods[0] ?? "serial";
	const pickFlashMethod = (method: FlashMethodName) => {
		if (workflow) setFlashMethods(prev => ({ ...prev, [workflow.id]: method }));
	};

	// The flash dialog — where to write the board's firmware, by flashMethod.
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

			{/* Flash, and next to it how: one control, two halves. */}
			<div className="flex items-center rounded-md border border-line-subtle">
				<Button.Root
					variant="ghost"
					disabled={!workflow || !driverConnection}
					onClick={() => setFlashOpen(true)}
					title={`Flash by ${FLASH_METHODS[flashMethod].label} — write the board's firmware and install the runtime`}
					className="rounded-r-none! gap-1.5!"
				>
					<Button.Icon>
						<Zap size={14} />
					</Button.Icon>
					<span className="text-xs text-fg-muted">{FLASH_METHODS[flashMethod].label}</span>
				</Button.Root>

				<Dropdown.Root>
					<Dropdown.Trigger asChild disabled={!workflow}>
						<Button.Root variant="ghost" className="rounded-l-none! px-1! border-l border-line-subtle" title="How to flash">
							<Button.Icon>
								<ChevronDown size={12} />
							</Button.Icon>
						</Button.Root>
					</Dropdown.Trigger>
					<Dropdown.Content align="start" className="min-w-56! max-w-72!">
						<Dropdown.Label>Flash by</Dropdown.Label>
						{ALL_FLASH_METHODS.map(method => {
							const supported = boardMethods.includes(method);
							return (
								<Dropdown.Item
									key={method}
									disabled={!supported}
									onSelect={() => pickFlashMethod(method)}
									className={clsx("items-start!", !supported && "opacity-40 cursor-not-allowed! data-highlighted:bg-transparent!")}
								>
									<Check size={14} className={clsx("mt-0.5 shrink-0", method === flashMethod ? "text-accent-fg" : "invisible")} />
									<div className="flex flex-col gap-0.5">
										<span>{FLASH_METHODS[method].label}</span>
										<span className="text-xs text-fg-muted">
											{supported ? FLASH_METHODS[method].description : "This board can't be written this way."}
										</span>
									</div>
								</Dropdown.Item>
							);
						})}
					</Dropdown.Content>
				</Dropdown.Root>
			</div>

			{flashOpen && workflow && driverConnection && (
				<FlashDialog
					workflowId={workflow.id}
					driverId={driverConnection.id}
					method={flashMethod}
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
