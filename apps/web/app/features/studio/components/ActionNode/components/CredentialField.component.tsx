import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Select, Text } from "@henglosio/ui";
import type { ICredentialInputSchema, ICredentialValueSchema } from "@henglosio/workflow";
import { Pencil, Plus } from "lucide-react";
import clsx from "clsx";
import { listCredentials, listCredentialTypes } from "@shared/api";
import { CredentialDialog } from "@/features/credentials/components/CredentialDialog.component";

type CredentialFieldProps = {
	base: ICredentialInputSchema;
	value: ICredentialValueSchema | undefined;
	onChange: (value: ICredentialValueSchema | undefined) => void;
};

const NEW = "__new__";

/**
 * A `type: credential` config: one of the user's credentials of the type it
 * asks for, picked by name — or a new one made right here. The workflow keeps
 * only which; the values reach the board when a session starts.
 */
export const CredentialField: React.FC<CredentialFieldProps> = ({ base, value, onChange }) => {

	const { data: credentials = [] } = useQuery({ queryKey: ["credentials"], queryFn: listCredentials });
	const { data: types = [] } = useQuery({ queryKey: ["credential-types"], queryFn: listCredentialTypes });
	const [dialog, setDialog] = useState<"new" | "edit" | null>(null);

	const type = types.find(found => found.name === base.credential);
	const ofType = credentials.filter(credential => credential.type === base.credential);
	const picked = value ? credentials.find(credential => credential.id === value.credentialId) : undefined;
	// Picked, but not among the user's (deleted, or an imported workflow's).
	const missing = !!value && credentials.length > 0 && !picked;

	return (
		<div className="flex flex-col gap-1 w-56 nodrag">

			<div className="flex items-center gap-1">
				<Select.Root
					value={picked?.id ?? ""}
					onValueChange={next => {
						// "New…" opens the dialog; the pick stays what it was until one's made.
						if (next === NEW) return setDialog("new");
						onChange({ credentialId: next });
					}}
					className="flex-1 min-w-0"
				>
					<Select.Trigger
						placeholder={missing ? "Gone — pick another" : `Pick a ${type?.displayName ?? base.credential}`}
						className={clsx(missing && "border-danger-line")}
					/>
					<Select.Content>
						{ofType.map(credential => (
							<Select.Item key={credential.id} value={credential.id}>{credential.name}</Select.Item>
						))}
						<Select.Item value={NEW} className="text-accent-fg">+ New {type?.displayName ?? "credential"}…</Select.Item>
					</Select.Content>
				</Select.Root>
				<Button.Root
					variant="ghost"
					onClick={() => setDialog(picked ? "edit" : "new")}
					title={picked ? "Edit it" : "New one"}
				>
					<Button.Icon>{picked ? <Pencil size={11} /> : <Plus size={11} />}</Button.Icon>
				</Button.Root>
			</div>

			{missing && <Text variant="dim" size="xs" className="text-danger">The credential picked isn't yours any more — pick or make one.</Text>}
			{!type && types.length > 0 && <Text variant="dim" size="xs" className="text-danger">No installed component declares “{base.credential}”.</Text>}

			<CredentialDialog
				open={dialog !== null}
				type={base.credential}
				credential={dialog === "edit" ? picked : undefined}
				onClose={() => setDialog(null)}
				onSaved={saved => onChange({ credentialId: saved.id })}
			/>

		</div>
	);

};
