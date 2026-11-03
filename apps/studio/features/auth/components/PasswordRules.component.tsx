import clsx from "clsx";
import { Check, Circle } from "lucide-react";

// The same rules the hosting checks (Password, in apps/hosting) — keep them in sync.
const PASSWORD_RULES = [
	{ label: "8 to 35 characters", check: (password: string) => password.length >= 8 && password.length <= 35 },
	{ label: "One capital letter", check: (password: string) => /[A-Z]/.test(password) },
	{ label: "One number", check: (password: string) => /\d/.test(password) },
	{ label: "No spaces", check: (password: string) => password.length > 0 && !password.includes(" ") },
];

/** Whether `password` meets every rule. */
export const isPasswordValid = (password: string) => PASSWORD_RULES.every(rule => rule.check(password));

/** What a password must have, each rule marked as it's met while typing. */
export const PasswordRules = ({ password }: { password: string }) => (

	<ul className="w-full flex flex-col gap-1">
		{PASSWORD_RULES.map(rule => {
			const met = rule.check(password);
			return (
				<li key={rule.label} className={clsx("flex items-center gap-2 text-xs leading-4", met ? "text-success" : "text-fg-muted")}>
					{met ? <Check size={12} /> : <Circle size={12} />}
					{rule.label}
				</li>
			);
		})}
	</ul>

);
