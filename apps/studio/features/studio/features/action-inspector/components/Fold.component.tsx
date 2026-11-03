import { useState } from "react";
import { Text } from "@henglosio/ui";
import { ChevronDown, ChevronRight } from "lucide-react";

/** A group folded away under what's always shown — the advanced configs. */
export const Fold: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
	const [open, setOpen] = useState(false);
	const Chevron = open ? ChevronDown : ChevronRight;
	return (
		<div className="flex flex-col gap-3">
			<button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-fit cursor-pointer text-fg-secondary hover:text-fg">
				<Chevron size={12} />
				<Text variant="dim" size="xs">{title}</Text>
			</button>
			{open && <div className="flex flex-col gap-4 pl-3 border-l border-line-subtle">{children}</div>}
		</div>
	);
};
