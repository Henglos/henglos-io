import React from "react";

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
	<div className="flex flex-col gap-2">
		<span className="text-xs text-fg-secondary">{label}</span>
		{children}
	</div>
);

export const ReadValue: React.FC<{ value: string; mono?: boolean }> = ({ value, mono }) => (
	<span className={`text-xs text-fg ${mono ? "font-mono" : ""}`}>
		{value}
	</span>
);

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<p className="text-xs text-fg-muted uppercase tracking-wider mb-4">
		{children}
	</p>
);
