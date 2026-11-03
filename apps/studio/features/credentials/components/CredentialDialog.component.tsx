import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Input, Select, Text } from "@henglosio/ui";
import { KeyRound, Loader2, Lock, X } from "lucide-react";
import type { CredentialOut, CredentialTypeOut } from "@henglosio/shared";
import { createCredential, listCredentialTypes, updateCredential } from "@shared/api";

type CredentialDialogProps = {
	open: boolean;
	onClose: () => void;
	/** Editing this one — or, without it, making a new one. */
	credential?: CredentialOut;
	/** A new one of this type (from a config) — without it, the type is picked here. */
	type?: string;
	onSaved?: (credential: CredentialOut) => void;
};

/**
 * Making or editing a credential: its type's fields, as the component that
 * declares them describes them. A secret field is never shown back — when it's
 * set, leaving it empty keeps it, typing replaces it.
 */
export const CredentialDialog: React.FC<CredentialDialogProps> = ({ open, onClose, credential, type: fixedType, onSaved }) => {

	const queryClient = useQueryClient();
	const { data: types = [], isLoading } = useQuery({ queryKey: ["credential-types"], queryFn: listCredentialTypes, enabled: open });

	const [typeName, setTypeName] = useState<string>("");
	const [name, setName] = useState("");
	const [values, setValues] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	const type: CredentialTypeOut | undefined = useMemo(
		() => types.find(found => found.name === (credential?.type ?? fixedType ?? typeName)),
		[types, credential, fixedType, typeName],
	);

	// Fresh each time it opens: the credential's values (secrets blank), or empty.
	useEffect(() => {
		if (!open) return;
		setError(null);
		setTypeName(credential?.type ?? fixedType ?? "");
		setName(credential?.name ?? "");
		setValues(Object.fromEntries(Object.entries(credential?.fields ?? {}).map(([key, value]) => [key, value === null ? "" : String(value)])));
	}, [open, credential, fixedType]);

	// A new one's name, once its type is known: the type's.
	useEffect(() => {
		if (open && !credential && type && !name) setName(type.displayName);
	}, [open, credential, type]);

	const { mutate: save, isPending } = useMutation({
		mutationFn: async () => {
			if (!type) throw new Error("Pick a type");
			// Secret fields left empty aren't sent: on an edit, they keep what they were.
			const fields = Object.fromEntries(
				type.fields
					.map(field => [field.name, values[field.name] ?? ""] as const)
					.filter(([key, value]) => !(value === "" && type.fields.find(field => field.name === key)?.secret)),
			);
			return credential
				? updateCredential(credential.id, { name: name.trim(), fields })
				: createCredential({ type: type.name, name: name.trim(), fields });
		},
		onSuccess: saved => {
			void queryClient.invalidateQueries({ queryKey: ["credentials"] });
			onSaved?.(saved);
			onClose();
		},
		onError: (err: unknown) => {
			const info = (err as { info?: string }).info ?? (err as { response?: { data?: { info?: string } } }).response?.data?.info;
			setError(info ?? (err instanceof Error ? err.message : "Couldn't save it"));
		},
	});

	const missingRequired = type?.fields.some(field =>
		field.required && !(values[field.name] ?? "").trim() && !(field.secret && credential?.secretsSet.includes(field.name)));

	return (
		<Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
			<Dialog.Overlay />
			{open && (
				<Dialog.Content
					className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col w-md max-w-[calc(100vw-2rem)] border border-line-strong rounded-lg overflow-hidden bg-raised"
					onEscapeKeyDown={onClose}
					onInteractOutside={onClose}
				>
					<div className="flex items-center justify-between px-4 py-4 border-b border-line shrink-0">
						<div className="flex flex-col">
							<Dialog.Title>{credential ? `Edit ${credential.name}` : type ? `New ${type.displayName}` : "New credential"}</Dialog.Title>
							<Text variant="low" size="xs">Kept by the hosting, encrypted — workflows only point at it.</Text>
						</div>
						<Dialog.Close asChild>
							<Button.Root size="md" variant="ghost" onClick={onClose}>
								<Button.Icon><X size={14} /></Button.Icon>
							</Button.Root>
						</Dialog.Close>
					</div>

					<div className="flex flex-col gap-4 p-4">

						{!credential && !fixedType && (
							<Select.Root value={typeName} onValueChange={next => { setTypeName(next); setName(""); setValues({}); }} className="w-full">
								<Select.Trigger placeholder={isLoading ? "Loading…" : types.length ? "Type — pick one" : "No installed component declares any"} />
								<Select.Content>
									{types.map(found => (
										<Select.Item key={found.name} value={found.name}>{found.displayName} — {found.declaredBy}</Select.Item>
									))}
								</Select.Content>
							</Select.Root>
						)}

						{!type && (credential || fixedType) && !isLoading && (
							<Text variant="dim" size="xs" className="text-danger">
								No installed component declares the type “{credential?.type ?? fixedType}” — install the one that does.
							</Text>
						)}

						{type && (
							<>
								{type.description && <Text variant="low" size="xs">{type.description}</Text>}

								<Input.Root>
									<Input.Label>Name</Input.Label>
									<Input.Field value={name} onChange={event => setName(event.target.value)} placeholder={`e.g. ${type.displayName} at home`} />
								</Input.Root>

								{type.fields.map(field => {
									const saved = field.secret && credential?.secretsSet.includes(field.name);
									return (
										<div key={field.name} className="flex flex-col gap-1">
											<Input.Root>
												<Input.Label>
													<span className="inline-flex items-center gap-1">
														{field.displayName}
														{field.required && <span className="text-danger">*</span>}
														{field.secret && <Lock size={10} className="text-fg-muted" />}
													</span>
												</Input.Label>
												<Input.Field
													type={field.secret ? "password" : field.type === "number" ? "number" : "text"}
													autoComplete={field.secret ? "new-password" : "off"}
													value={values[field.name] ?? ""}
													onChange={event => setValues(prev => ({ ...prev, [field.name]: event.target.value }))}
													placeholder={saved ? "•••••••• saved — type to replace" : field.placeholder}
												/>
											</Input.Root>
											{field.description && <Text variant="low" size="xs">{field.description}</Text>}
										</div>
									);
								})}
							</>
						)}

						{error && <Text variant="dim" size="xs" className="text-danger">{error}</Text>}
					</div>

					<div className="flex items-center justify-end gap-2 px-4 py-4 border-t border-line shrink-0">
						<Button.Root variant="ghost" onClick={onClose}>
							<Button.Label>Cancel</Button.Label>
						</Button.Root>
						<Button.Root variant="primary" onClick={() => save()} disabled={!type || !name.trim() || !!missingRequired || isPending}>
							<Button.Icon>{isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}</Button.Icon>
							<Button.Label>{credential ? "Save" : "Create"}</Button.Label>
						</Button.Root>
					</div>
				</Dialog.Content>
			)}
		</Dialog.Root>
	);

};
