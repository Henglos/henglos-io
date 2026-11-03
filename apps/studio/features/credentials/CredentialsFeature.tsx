"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Skeleton, Text } from "@henglosio/ui";
import { KeyRound, Lock, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { CredentialOut } from "@henglosio/shared";
import { ActivityBar } from "@/shared/components/ActiveBar.component";
import { deleteCredential, listCredentials, listCredentialTypes } from "@shared/api";
import { CredentialDialog } from "./components/CredentialDialog.component";

/**
 * The user's credentials — WiFi networks, API tokens… — n8n-style: made once
 * here (or from a config's "New"), picked by name in any workflow, kept by
 * the hosting with the secret fields encrypted. Their kinds come from the
 * installed components.
 */
export const CredentialsFeature = () => {

	const queryClient = useQueryClient();
	const { data: credentials, isLoading } = useQuery({ queryKey: ["credentials"], queryFn: listCredentials });
	const { data: types = [] } = useQuery({ queryKey: ["credential-types"], queryFn: listCredentialTypes });

	const [editing, setEditing] = useState<CredentialOut | undefined>();
	const [dialogOpen, setDialogOpen] = useState(false);

	const { mutate: remove } = useMutation({
		mutationFn: deleteCredential,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["credentials"] }),
	});

	const typeName = (name: string) => types.find(type => type.name === name)?.displayName ?? name;

	const onDelete = (credential: CredentialOut) => {
		if (window.confirm(`Delete "${credential.name}"? Workflows that pick it will ask for another one.`)) remove(credential.id);
	};

	return (

		<main className="flex w-full h-full bg-canvas overflow-hidden">

			<ActivityBar />

			<section className="w-full flex flex-col flex-1 min-h-0">

				<div className="flex justify-center w-full flex-1 min-h-0 overflow-y-auto">

					<div className="w-5xl h-fit flex flex-col gap-6 p-6">

						<div className="flex items-end gap-4 pt-6">
							<div className="flex flex-col gap-1">
								<Text variant="high" size="xl" font="sans" className="font-bold">Credentials</Text>
								<Text variant="low" size="sm">
									WiFi networks, API tokens and the like — made once, picked by name in any workflow. The secret
									fields are encrypted and never shown again.
								</Text>
							</div>
							<Button.Root variant="primary" size="md" className="ml-auto" onClick={() => { setEditing(undefined); setDialogOpen(true); }} disabled={types.length === 0}>
								<Button.Icon><Plus size={16} /></Button.Icon>
								<Button.Label>New credential</Button.Label>
							</Button.Root>
						</div>

						<div className="flex flex-col border border-line rounded-xl bg-panel overflow-hidden divide-y divide-line">

							{isLoading && Array.from({ length: 2 }, (_, i) => (
								<div key={i} className="px-4 py-3"><Skeleton className="h-10 w-full rounded" /></div>
							))}

							{credentials?.map(credential => (
								<div key={credential.id} className="group flex items-center gap-3 px-4 py-3">
									<div className="flex items-center justify-center size-9 shrink-0 rounded-lg border border-line-subtle bg-field text-accent-fg">
										<KeyRound size={15} />
									</div>
									<div className="flex flex-col min-w-0 flex-1">
										<Text variant="high" size="sm" className="truncate">{credential.name}</Text>
										<div className="flex items-center gap-2 min-w-0">
											<Text variant="low" size="xs">{typeName(credential.type)}</Text>
											{Object.entries(credential.fields).filter(([, value]) => value !== null).slice(0, 2).map(([key, value]) => (
												<Text key={key} variant="low" size="xs" className="truncate font-mono">· {key}: {String(value)}</Text>
											))}
											{credential.secretsSet.length > 0 && (
												<Text variant="low" size="xs" className="flex items-center gap-1 shrink-0"><Lock size={10} /> {credential.secretsSet.join(", ")}</Text>
											)}
										</div>
									</div>
									{credential.typeMissing && (
										<Text variant="dim" size="xs" className="flex items-center gap-1 text-warning shrink-0" title="No installed component declares its type — install it again to edit or use it">
											<TriangleAlert size={12} /> type not installed
										</Text>
									)}
									<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<Button.Root variant="ghost" onClick={() => { setEditing(credential); setDialogOpen(true); }} disabled={credential.typeMissing} title="Edit">
											<Button.Icon><Pencil size={13} /></Button.Icon>
										</Button.Root>
										<Button.Root variant="ghost" onClick={() => onDelete(credential)} title="Delete">
											<Button.Icon><Trash2 size={13} className="text-danger" /></Button.Icon>
										</Button.Root>
									</div>
								</div>
							))}

							{!isLoading && credentials?.length === 0 && (
								<div className="flex flex-col items-center gap-2 py-14 px-6 text-center">
									<KeyRound size={20} className="text-fg-muted" />
									<Text variant="high" size="md">No credentials yet</Text>
									<Text variant="low" size="sm" className="max-w-md">
										{types.length === 0
											? "Install a component that needs one — like WiFi — and its kind of credential shows up here."
											: "Make one here, or from a config that asks for one (its “New” option)."}
									</Text>
								</div>
							)}

						</div>

					</div>

				</div>

			</section>

			<CredentialDialog open={dialogOpen} credential={editing} onClose={() => setDialogOpen(false)} />

		</main>

	);

};
