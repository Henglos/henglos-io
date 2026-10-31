import type { Preview } from "@storybook/react-vite";
import React from "react";
import "../src/globals.css";

const preview: Preview = {
	parameters: {
		backgrounds: { disable: true },
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		a11y: { test: "todo" },
	},
	decorators: [
		(Story) => (
			<div
				style={{
					background: "var(--color-background)",
					minHeight: "100vh",
					padding: "2rem",
					display: "flex",
					alignItems: "flex-start",
					gap: "1rem",
					flexWrap: "wrap",
				}}
			>
				<Story />
			</div>
		),
	],
};

export default preview;
