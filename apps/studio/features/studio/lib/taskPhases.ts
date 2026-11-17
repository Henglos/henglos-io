// A task's phases (its `progress` events), as the studio names them — the
// board's firmware gets its own "prepare" (setting up toolchains, once) apart
// from the build and the flash.
export const PHASE_LABELS: Record<string, string> = {
	sync: "Syncing packages",
	prepare: "Preparing the environment",
	build: "Building",
	flash: "Flashing",
	firmware: "Writing the firmware",
	check: "Checking the board",
	upload: "Uploading the runtime",
	install: "Installing components",
	record: "Recording",
};

export const phaseLabel = (phase: string): string => PHASE_LABELS[phase] ?? phase;
