import { useState } from "react";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Button, Dialog, Dropdown, emitToast, Input, Select, Switch, Text } from "@henglosio/ui";
// The browser entry: the main one pulls in Node-only code (child_process, fs).
import { checkPlatformSettings, type PlatformSetting } from "@henglosio/shared/browser";
import { Blocks, Check, ChevronDown, Info, RotateCcw, Settings, TriangleAlert, X } from "lucide-react";
import clsx from "clsx";
import { rcompare, satisfies, valid } from "semver";
import { getPlatformSettings, listPackages, updateWorkflow } from "@shared/api";
import { WorkflowAtom } from "@/features/studio/store/workflow.store";
import { useWorkflowMutate } from "@/features/studio/hooks/useWorkflowMutate";
import { useSyncedDraft } from "@/features/studio/lib/useSyncedDraft";
import { boardOptionError, boardOptionScope, type BoardOptionValue, type IBoardOption } from "@henglosio/workflow";
import { usePlatformVersions } from "./usePlatformVersions.hook";

// Hosting error ids a platform change can come back with (UpdateWorkflowUseCase).
const ERRORS: Record<string, string> = {
	incompatible_platform_version: "The board or a component of this workflow doesn't support that platform version.",
	platform_not_found: "That platform version isn't published.",
};

// Shown first, in this order; any other group after them.
const GROUP_ORDER = ["Memory", "Storage", "Timing", "Protocol"];

type PlatformWindowProps = {
	onClose: () => void;
};

/**
 * The workflow's platform — the runtime on the board: which version (applies
 * once the workflow is compiled and uploaded), and its limits (sent with the
 * next run, read by the runtime when it starts — no compile, from platform
 * 1.3.0). Centered and modal, over an overlay: these change what runs on the
 * board, so they get the whole screen's attention.
 */
export const PlatformWindow: React.FC<PlatformWindowProps> = ({ onClose }) => {

	const [workflow, setWorkflow] = useAtom(WorkflowAtom);
	const mutate = useWorkflowMutate();
	const { versions } = usePlatformVersions(workflow?.platform);
	const [changing, setChanging] = useState(false);

	const version = workflow?.platform;
	const { data, isLoading, isError } = useQuery({
		queryKey: ["platform-settings", version],
		queryFn: () => getPlatformSettings(version!),
		enabled: !!version,
		staleTime: Infinity,          // a published version never changes
	});

	if (!workflow) return null;

	const settings = data?.settings ?? [];
	const overrides = workflow.data.platformSettings ?? {};
	const problems = checkPlatformSettings(settings, data?.rules ?? [], overrides);
	const declared = new Set(settings.map(setting => setting.key));
	// Overrides this platform version doesn't declare (set under another one) — the board ignores them.
	const stray = data ? Object.keys(overrides).filter(key => !declared.has(key)) : [];
	const overridden = Object.keys(overrides).filter(key => declared.has(key)).length;

	const setLimit = (key: string, value: number | null) => mutate({ op: "update:platform-setting", key, value });
	const resetAll = () => mutate(...Object.keys(overrides).map(key => ({ op: "update:platform-setting" as const, key, value: null })));

	const changeVersion = async (next: string) => {
		if (next === version || changing) return;
		setChanging(true);
		try {
			const updated = await updateWorkflow(workflow.id, { patch: [{ op: "change:platform", path: "", version: next }] });
			// Only the platform: `data` is kept in step by the collab doc, not this response.
			setWorkflow(prev => prev && { ...prev, platform: updated.platform });
			emitToast("success", `Platform ${updated.platform} — compile and upload the workflow to run it.`);
		} catch (error) {
			// BaseError.toResponseString(): { id, info }.
			const id = isAxiosError(error) ? (error.response?.data as { id?: string } | undefined)?.id : undefined;
			emitToast("error", ERRORS[id ?? ""] ?? `Couldn't change the platform to ${next}.`);
		} finally {
			setChanging(false);
		}
	};

	const groups = new Map<string, PlatformSetting[]>();
	for (const setting of settings) {
		const group = setting.group ?? "General";
		groups.set(group, [...(groups.get(group) ?? []), setting]);
	}
	const orderedGroups = [...groups.entries()].sort(([a], [b]) =>
		(GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));

	return (

		<Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
			<Dialog.Content
				className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,calc(100vw-32px))] max-h-[calc(100vh-64px)] flex flex-col rounded-lg border border-line shadow-[0_8px_32px_rgb(0_0_0/0.4)]"
				aria-describedby={undefined}
			>
				<div className="flex flex-col min-h-0">

					<div className="flex items-center gap-2 px-4 h-11 border-b border-line-subtle shrink-0">
						<Settings size={14} className="text-accent-fg" />
						<Dialog.Title>Workflow settings</Dialog.Title>
						<Dialog.Close asChild>
							<Button.Root type="button" variant="ghost" className="p-2! ml-auto">
								<Button.Icon><X size={12} /></Button.Icon>
							</Button.Root>
						</Dialog.Close>
					</div>

					<div className="flex flex-col overflow-y-auto min-h-0">

						{/* ── Board ───────────────────────────────────────────────── */}
						<BoardSection />
						<BoardOptionsSection />

						{/* ── Version ─────────────────────────────────────────────── */}
						<Section title="Version">

							<div className="flex items-center gap-2">
								<Text variant="dim" size="sm">Platform</Text>
								<Text variant="high" size="sm" font="mono">{version}</Text>

								<Dropdown.Root>
									<Dropdown.Trigger asChild>
										<Button.Root type="button" variant="ghost" size="sm" className="ml-auto" disabled={changing}>
											<Button.Label>Change</Button.Label>
											<Button.Icon><ChevronDown size={12} /></Button.Icon>
										</Button.Root>
									</Dropdown.Trigger>
									<Dropdown.Content align="end">
										{versions.length === 0 && <Dropdown.Item disabled>No platform versions published</Dropdown.Item>}
										{versions.map(option => (
											<Dropdown.Item key={option} onSelect={() => changeVersion(option)}>
												<span className="flex items-center gap-2 w-full font-mono">
													<span className={clsx("w-3", option !== version && "opacity-0")}><Check size={12} /></span>
													{option}
												</span>
											</Dropdown.Item>
										))}
									</Dropdown.Content>
								</Dropdown.Root>
							</div>

						</Section>

						{/* ── Limits ──────────────────────────────────────────────── */}
						<Section
							title="Limits"
							aside={overridden > 0 && (
								<button type="button" onClick={resetAll} className="flex items-center gap-1 cursor-pointer text-fg-muted hover:text-fg">
									<RotateCcw size={11} />
									<Text variant="low" size="xs">Reset all ({overridden})</Text>
								</button>
							)}
						>

							{isLoading && <Text variant="low" size="xs">Loading…</Text>}
							{isError && <Text variant="low" size="xs" className="text-danger!">Couldn't load the limits of platform {version}.</Text>}
							{data && settings.length === 0 && (
								<Text variant="low" size="xs">Platform {version} has no limits to override — update the platform to get them.</Text>
							)}

							{orderedGroups.map(([group, items]) => (
								<div key={group} className="flex flex-col gap-3">
									<div className="flex items-center gap-2">
										<Text variant="low" size="xs" font="mono" className="uppercase tracking-wide">{group}</Text>
										<div className="h-px flex-1 bg-line-subtle" />
									</div>
									{group === "Protocol" && (
										<div className="flex gap-2">
											<Info size={12} className="shrink-0 mt-0.5 text-fg-muted" />
											<Text variant="low" size="xs">The studio builds its packets with these too, so the board and the host always agree. Bigger values cost RAM on the board.</Text>
										</div>
									)}
									{items.map(setting => (
										<LimitRow
											key={setting.key}
											setting={setting}
											value={overrides[setting.key]}
											problem={problems[setting.key]}
											onChange={value => setLimit(setting.key, value)}
										/>
									))}
								</div>
							))}

							{stray.length > 0 && (
								<div className="flex flex-col gap-2 rounded-md border border-line-subtle p-3">
									<Text variant="dim" size="xs">Not limits of platform {version} — ignored by the board:</Text>
									{stray.map(key => (
										<div key={key} className="flex items-center gap-2">
											<Text variant="low" size="xs" font="mono">{key} = {overrides[key]}</Text>
											<Button.Root type="button" variant="ghost" className="p-1.5! ml-auto" onClick={() => setLimit(key, null)}>
												<Button.Icon><X size={11} /></Button.Icon>
											</Button.Root>
										</div>
									))}
								</div>
							)}

						</Section>

					</div>

					<div className="px-4 py-2.5 border-t border-line-subtle shrink-0">
						<Text variant="low" size="xs">Limits apply the next time the workflow runs — no compile needed (platform 1.3.0 and later; earlier versions compile them in). A new version still needs a compile and upload.</Text>
					</div>

				</div>
			</Dialog.Content>
		</Dialog.Root>

	);

};

// What the workflow runs on — its board: any version of any board in the
// library that builds on the workflow's platform. The components and their
// actions stay; pins picked for the old board may not be on the new one.
const BoardSection: React.FC = () => {

	const [workflow] = useAtom(WorkflowAtom);
	const mutate = useWorkflowMutate();
	const [changing, setChanging] = useState(false);
	const [changed, setChanged] = useState(false);

	const { data: boards } = useQuery({
		queryKey: ["packages", "board", ""],
		queryFn: () => listPackages({ q: "", type: "board" }),
	});

	if (!workflow) return null;

	const platform = workflow.platform;
	const current = workflow.data.board.packageId;
	const all = (boards ?? []).flatMap(board => board.versions.map(version => ({ id: version.id, name: board.name, version: version.version, platform: version.platform })));
	// The versions that build on this platform.
	const builds = (range: string) => !platform || !valid(platform) || satisfies(platform, range, { includePrerelease: true });
	const options = all.filter(option => builds(option.platform));
	const currentOption = all.find(option => option.id === current);
	// The boards, each with its versions that build here — newest first.
	const groups = (boards ?? [])
		.map(board => ({
			name: board.name,
			versions: board.versions.filter(version => builds(version.platform)).sort((a, b) => valid(a.version) && valid(b.version) ? rcompare(a.version, b.version) : 0),
		}))
		.filter(group => group.versions.length > 0);

	const change = async (packageId: string) => {
		if (packageId === current || changing) return;
		setChanging(true);
		try {
			await mutate({ op: "change:board", packageId });
			setChanged(true);
			const picked = options.find(option => option.id === packageId);
			emitToast("success", `Board ${picked ? `${picked.name} · ${picked.version}` : "changed"} — compile and upload the workflow to run on it.`);
		} catch {
			// the http interceptor already surfaces a detailed error toast
		} finally {
			setChanging(false);
		}
	};

	return (
		<Section title="Board">
			<div className="flex items-center gap-2">
				<Blocks size={13} className="shrink-0 text-fg-muted" />
				<Text variant="high" size="sm" className="truncate">{workflow.data.board.base.name}</Text>
				{currentOption && <Text variant="low" size="xs" font="mono">{currentOption.version}</Text>}

				<Dropdown.Root>
					<Dropdown.Trigger asChild>
						<Button.Root type="button" variant="ghost" size="sm" className="ml-auto" disabled={changing}>
							<Button.Label>Change</Button.Label>
							<Button.Icon><ChevronDown size={12} /></Button.Icon>
						</Button.Root>
					</Dropdown.Trigger>
					{/* The boards — hovering one opens its versions beside it. */}
					<Dropdown.Content align="end" className="p-1! min-w-48">
						{groups.length === 0 && <Dropdown.Item disabled className="text-xs!">No board in your library builds on platform {platform}</Dropdown.Item>}
						{groups.map(group => {
							const isCurrent = group.name === currentOption?.name;
							return (
								<Dropdown.Sub key={group.name}>
									<Dropdown.SubTrigger className={clsx("text-xs! py-1.5! px-2!", isCurrent && "text-accent-fg!")}>
										<span className={clsx("size-1.5 rounded-full shrink-0", isCurrent ? "bg-accent-fg" : "bg-fg-muted/40")} />
										<span className="flex-1 truncate">{group.name}</span>
										<span className="text-[10px] text-fg-muted tabular-nums">{group.versions.length}</span>
									</Dropdown.SubTrigger>
									<Dropdown.SubContent className="p-1! min-w-32">
										{group.versions.map(version => (
											<Dropdown.Item key={version.id} onSelect={() => change(version.id)} className="text-xs! py-1.5! pl-2! pr-3!">
												<Check size={12} className={clsx("shrink-0", version.id === current ? "text-accent-fg" : "invisible")} />
												<span className="font-mono">{version.version}</span>
											</Dropdown.Item>
										))}
									</Dropdown.SubContent>
								</Dropdown.Sub>
							);
						})}
					</Dropdown.Content>
				</Dropdown.Root>
			</div>

			{changed ? (
				<div className="flex items-start gap-2 px-3 py-2 rounded-md border border-line bg-field">
					<TriangleAlert size={13} className="shrink-0 mt-0.5 text-fg-muted" />
					<Text variant="dim" size="xs">
						The components and actions stay. Pins picked for the old board may not exist on this one — check their configurations, then compile and upload again.
					</Text>
				</div>
			) : (
				<Text variant="low" size="xs">Only boards in your library that build on platform {platform} are offered — add others in the Library.</Text>
			)}
		</Section>
	);

};

const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> =({ title, aside, children }) => (
	<div className="flex flex-col gap-3 px-4 py-4 not-last:border-b border-line-subtle">
		<div className="flex items-center">
			<Text variant="dim" size="xs" className="font-medium">{title}</Text>
			{aside && <div className="ml-auto">{aside}</div>}
		</div>
		{children}
	</div>
);

// What changing an option redoes — its `scope` (build when it doesn't say).
const SCOPE_HINTS = {
	runtime: "Applies on the next run.",
	build: "Needs a compile and upload.",
	prepare: "Sets the build environment up again, then needs a compile and upload.",
} as const;

// An option's description, followed by what a change to it redoes.
const describeOption = (option: IBoardOption) => `${option.description} ${SCOPE_HINTS[boardOptionScope(option)]}`.trim();

// The parameters of the board's firmware, when it has any — a form from its
// manifest's `options`.
const BoardOptionsSection: React.FC = () => {

	const [workflow] = useAtom(WorkflowAtom);
	const mutate = useWorkflowMutate();

	const options = workflow?.data.board.base.options ?? [];
	if (!workflow || options.length === 0) return null;

	const picked = workflow.data.boardOptions ?? {};
	// Writing the default is the same as not picking one.
	const set = (option: IBoardOption, value: BoardOptionValue | null) =>
		mutate({ op: "update:board-option", key: option.key, value: value === option.default ? null : value });

	return (
		<Section title="Board options">
			{options.map(option => {
				if (option.type === "integer") {
					const value = picked[option.key];
					return (
						<LimitRow
							key={option.key}
							setting={{ ...option, description: describeOption(option) }}
							value={typeof value === "number" ? value : undefined}
							problem={value === undefined ? undefined : boardOptionError(option, value) ?? undefined}
							onChange={next => set(option, next)}
						/>
					);
				}
				const value = picked[option.key] ?? option.default;
				return (
					<div key={option.key} className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<Text variant={option.key in picked ? "high" : "dim"} size="sm">{option.displayName}</Text>
							{option.key in picked && <span className="size-1.5 rounded-full bg-accent" title="Changed" />}
							<div className="ml-auto">
								{option.type === "boolean" && (
									<Switch.Root checked={value === true} onCheckedChange={next => set(option, next)} />
								)}
							</div>
						</div>
						{option.type === "select" && (
							<Select.Root value={String(value)} onValueChange={next => set(option, next)}>
								<Select.Trigger placeholder={option.displayName} />
								<Select.Content>
									{option.choices.map(choice => <Select.Item key={choice} value={choice}>{choice}</Select.Item>)}
								</Select.Content>
							</Select.Root>
						)}
						{boardOptionError(option, value)
							? <Text variant="low" size="xs" className="text-danger!">{boardOptionError(option, value)}</Text>
							: <Text variant="low" size="xs">{describeOption(option)}</Text>}
					</div>
				);
			})}
		</Section>
	);

};

type LimitRowProps = {
	setting: Pick<PlatformSetting, "key" | "displayName" | "description" | "default" | "min" | "max" | "unit">;
	/** The workflow's override — undefined: the platform's default. */
	value: number | undefined;
	/** Out of range, or a rule with another limit broken (checkPlatformSettings). */
	problem: string | undefined;
	onChange: (value: number | null) => void;
};

const LimitRow: React.FC<LimitRowProps> = ({ setting, value, problem, onChange }) => {

	const [draft, setDraft] = useSyncedDraft(value, current => current === undefined ? "" : String(current));
	const [typingError, setTypingError] = useState<string | null>(null);
	const overridden = value !== undefined;
	const error = typingError ?? problem;

	// Digits only (and a leading "-" when the range allows negatives).
	const typing = setting.min < 0 ? /^-?\d*$/ : /^\d*$/;

	const commit = () => {
		if (draft === "") {
			setTypingError(null);
			if (overridden) onChange(null);
			return;
		}
		const next = Number(draft);
		if (!Number.isInteger(next) || next < setting.min || next > setting.max) {
			setTypingError(`Between ${setting.min} and ${setting.max}.`);
			return;
		}
		setTypingError(null);
		// Writing the default is the same as not overriding.
		onChange(next === setting.default ? null : next);
	};

	return (

		<div className="flex flex-col gap-1">

			<div className="flex items-center gap-2">
				<Text variant={overridden ? "high" : "dim"} size="sm">{setting.displayName}</Text>
				{overridden && <span className="size-1.5 rounded-full bg-accent" title="Overridden" />}
				<Text variant="low" size="xs" font="mono" className="ml-auto">{setting.key}</Text>
			</div>

			<div className="flex items-center gap-2">
				<Input.Root className={clsx("h-8 flex-1 min-w-0", error && "ring-1 ring-danger rounded-md")} value={draft}>
					<Input.Field
						inputMode="numeric"
						className="font-mono tabular-nums"
						placeholder={`${setting.default} (default)`}
						value={draft}
						onChange={e => { if (typing.test(e.target.value)) setDraft(e.target.value); }}
						onBlur={commit}
						onKeyDown={e => { if (e.key === "Enter") commit(); }}
					/>
					{setting.unit && <Input.Affix>{setting.unit}</Input.Affix>}
				</Input.Root>
				<Button.Root
					type="button"
					variant="ghost"
					className="p-2!"
					disabled={!overridden}
					title={`Back to the default (${setting.default})`}
					onClick={() => { setTypingError(null); onChange(null); }}
				>
					<Button.Icon><RotateCcw size={12} /></Button.Icon>
				</Button.Root>
			</div>

			{error
				? <Text variant="low" size="xs" className="text-danger!">{error}</Text>
				: <Text variant="low" size="xs">{setting.description} <span className="font-mono">{setting.min}–{setting.max}</span></Text>}

		</div>

	);

};
