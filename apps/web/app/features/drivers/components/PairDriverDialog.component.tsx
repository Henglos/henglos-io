import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Input, Text, emitToast } from "@henglosio/ui";
import { Check, CircleCheck, Copy, KeyRound, Loader2, X } from "lucide-react";
import clsx from "clsx";
import { generateDriverPairToken, listDrivers } from "@shared/api";

type PairDriverDialogProps = {
	onClose: () => void;
};

// While waiting for the new driver to connect.
const POLL_MS = 3000;

/**
 * Pairing a driver, step by step: name it, get a token, run the commands on
 * that computer — then it watches for the driver to show up online.
 */
export const PairDriverDialog: React.FC<PairDriverDialogProps> = ({ onClose }) => {

	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [pairToken, setPairToken] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	// The drivers there were before this token — the new one is whatever isn't among them.
	const knownIds = useRef<Set<string> | null>(null);

	const { mutate: generate, isPending } = useMutation({
		mutationFn: generateDriverPairToken,
		onSuccess: ({ pairToken }) => setPairToken(pairToken),
	});

	const { data: drivers } = useQuery({
		queryKey: ["drivers"],
		queryFn: listDrivers,
		refetchInterval: pairToken ? POLL_MS : false,
	});

	useEffect(() => {
		if (pairToken && !knownIds.current && drivers) knownIds.current = new Set(drivers.map(driver => driver.id));
	}, [pairToken, drivers]);

	const paired = pairToken && knownIds.current
		? drivers?.find(driver => !knownIds.current!.has(driver.id))
		: undefined;

	useEffect(() => {
		if (paired?.online) queryClient.invalidateQueries({ queryKey: ["devices", paired.id] });
	}, [paired?.online]);

	const driverName = name.trim() || "my-bench";
	const commands = pairToken
		? [
			`hio driver configure ${window.location.origin}`,
			`hio driver login ${pairToken} "${driverName}"`,
			"hio driver start",
		].join("\n")
		: null;

	const copy = async () => {
		if (!commands) return;
		await navigator.clipboard.writeText(commands);
		setCopied(true);
		emitToast("success", "Commands copied");
		setTimeout(() => setCopied(false), 1500);
	};

	const step = !pairToken ? 1 : !paired ? 2 : 3;

	return (
		<Dialog.Content
			className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col w-lg max-w-[calc(100vw-2rem)] border border-line-strong rounded-lg overflow-hidden bg-raised"
			onEscapeKeyDown={onClose}
			onInteractOutside={onClose}
		>

			<div className="flex items-center justify-between px-4 py-4 border-b border-line shrink-0">
				<div className="flex flex-col">
					<Dialog.Title>Pair a driver</Dialog.Title>
					<Text variant="low" size="xs">The computer your boards plug into, linked to your account.</Text>
				</div>
				<Dialog.Close asChild>
					<Button.Root size="md" variant="ghost" onClick={onClose}>
						<Button.Icon><X size={14} /></Button.Icon>
					</Button.Root>
				</Dialog.Close>
			</div>

			<div className="flex flex-col gap-5 p-4">

				<Step number={1} title="Name it" done={step > 1} active={step === 1}>
					<Input.Root>
						<Input.Field
							autoFocus
							placeholder="e.g. My bench"
							value={name}
							disabled={!!pairToken}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => { if (e.key === "Enter" && !pairToken) generate(); }}
						/>
					</Input.Root>
					{!pairToken && (
						<Button.Root variant="primary" size="md" onClick={() => generate()} disabled={isPending} className="self-start">
							<Button.Icon>{isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}</Button.Icon>
							<Button.Label>{isPending ? "Generating…" : "Generate pair token"}</Button.Label>
						</Button.Root>
					)}
				</Step>

				<Step number={2} title="Run this on that computer" done={step > 2} active={step === 2} muted={step < 2}>
					{commands ? (
						<>
							<Text variant="low" size="xs">
								With the Henglos IO CLI (<span className="font-mono">hio</span>) installed. The token expires in 15 minutes.
							</Text>
							<div className="flex items-start gap-2 pl-3 pr-1.5 py-2 rounded-md border border-line-subtle bg-canvas">
								<pre className="flex-1 whitespace-pre-wrap break-all font-mono text-xs leading-5 text-fg-secondary">
									{commands.split("\n").map(line => (
										<span key={line} className="block"><span className="text-accent-fg select-none">$ </span>{line}</span>
									))}
								</pre>
								<Button.Root variant="surface" size="sm" onClick={copy} title="Copy the commands">
									<Button.Icon>{copied ? <Check size={14} /> : <Copy size={14} />}</Button.Icon>
								</Button.Root>
							</div>
							{!paired && (
								<div className="flex items-center gap-2 text-fg-muted">
									<Loader2 size={12} className="animate-spin" />
									<Text variant="low" size="xs">Waiting for the driver to pair…</Text>
								</div>
							)}
						</>
					) : (
						<Text variant="low" size="xs">The commands show up here once there&apos;s a token.</Text>
					)}
				</Step>

				<Step number={3} title="Connected" done={!!paired?.online} active={step === 3} muted={step < 3}>
					{paired ? (
						<div className="flex items-center gap-2 px-3 h-10 rounded-md border border-accent-line bg-accent-subtle">
							{paired.online ? <CircleCheck size={14} className="text-accent" /> : <Loader2 size={14} className="animate-spin text-fg-muted" />}
							<Text variant="high" size="sm">{paired.name}</Text>
							<Text variant="low" size="xs" className="ml-auto">{paired.online ? "online — ready" : "paired, starting…"}</Text>
						</div>
					) : (
						<Text variant="low" size="xs">It shows up here, and in your devices, as soon as it connects.</Text>
					)}
				</Step>

			</div>

			<div className="flex items-center justify-end gap-2 px-4 py-4 border-t border-line shrink-0">
				{pairToken && !paired && (
					<Button.Root variant="ghost" onClick={() => { knownIds.current = null; generate(); }} disabled={isPending} className="mr-auto">
						<Button.Label>New token</Button.Label>
					</Button.Root>
				)}
				<Dialog.Close asChild>
					<Button.Root variant={paired?.online ? "primary" : "ghost"} onClick={onClose}>
						<Button.Label>{paired?.online ? "Done" : "Close"}</Button.Label>
					</Button.Root>
				</Dialog.Close>
			</div>

		</Dialog.Content>
	);

};

const Step: React.FC<{
	number: number;
	title: string;
	done: boolean;
	active: boolean;
	muted?: boolean;
	children: React.ReactNode;
}> = ({ number, title, done, active, muted, children }) => (
	<div className={clsx("flex gap-3 transition-opacity", muted && "opacity-50")}>
		<span
			className={clsx(
				"flex items-center justify-center size-6 shrink-0 rounded-full border font-mono text-xs",
				done ? "bg-accent border-accent text-on-accent" : active ? "border-accent-line bg-accent-subtle text-accent-fg" : "border-line text-fg-muted",
			)}
		>
			{done ? <Check size={12} /> : number}
		</span>
		<div className="flex flex-col gap-2 flex-1 min-w-0 pt-0.5">
			<Text variant="high" size="sm">{title}</Text>
			{children}
		</div>
	</div>
);
