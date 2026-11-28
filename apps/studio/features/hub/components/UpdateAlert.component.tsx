"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Text } from "@henglosio/ui";
import { ArrowUpRight, Sparkles, X } from "lucide-react";
import { getUpdateStatus } from "@shared/api";

/** The release whose alert was closed — it comes back for the next one. */
const DISMISSED_KEY = "hio:update-dismissed";

/**
 * "A new version is available": shown when the hosting says a newer HenglosIO
 * was released (GET /system/update), with a link to it on GitHub. Closing it
 * hides it until the next release.
 */
export const UpdateAlert: React.FC = () => {

	const { data } = useQuery({
		queryKey: ["system", "update"],
		queryFn: getUpdateStatus,
		// The hosting asks GitHub every few hours — no need to ask it often.
		staleTime: 60 * 60 * 1000,
		retry: false,
	});

	// Read after mounting: localStorage isn't there while rendering on the server.
	const [dismissed, setDismissed] = useState<string | null>(null);
	useEffect(() => setDismissed(localStorage.getItem(DISMISSED_KEY)), []);

	if (!data?.available || !data.latest || !data.url || dismissed === data.latest) return null;

	const dismiss = () => {
		localStorage.setItem(DISMISSED_KEY, data.latest!);
		setDismissed(data.latest);
	};

	return (
		<div role="status" className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line bg-panel">
			<Sparkles size={16} className="shrink-0 text-accent-fg" />

			<div className="flex flex-col min-w-0">
				<Text variant="high" size="sm" className="font-medium">HenglosIO {data.latest} is available</Text>
				<Text variant="low" size="xs">You're on {data.current}. See what changed and how to update.</Text>
			</div>

			{/* A link styled like a small ghost Button (asChild would size it as an icon-only one). */}
			<a
				href={data.url}
				target="_blank"
				rel="noopener noreferrer"
				className="ml-auto flex shrink-0 items-center gap-1.5 h-6 px-2 rounded-md text-xs whitespace-nowrap text-fg-muted hover:text-fg hover:bg-hover transition-colors"
			>
				View on GitHub
				<ArrowUpRight size={14} />
			</a>

			<Button.Root variant="ghost" size="sm" aria-label="Dismiss" onClick={dismiss}>
				<Button.Icon><X size={14} /></Button.Icon>
			</Button.Root>
		</div>
	);

};
