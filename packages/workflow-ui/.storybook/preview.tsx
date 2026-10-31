import type { Preview } from "@storybook/react-vite";
import React, { useEffect } from "react";
import "./preview.css";

const preview: Preview = {
	parameters: {
		backgrounds: { disable: true },
		layout: "fullscreen",
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		a11y: { test: "todo" },
	},
	// The design system's two themes — dark is the default (tokens.css :root).
	globalTypes: {
		theme: {
			description: "Theme",
			toolbar: {
				title: "Theme",
				icon: "contrast",
				items: [
					{ value: "dark", title: "Dark" },
					{ value: "light", title: "Light" },
				],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: { theme: "dark" },
	decorators: [
		// The canvas fills its box: a full-height page on the canvas color, like the studio's.
		(Story, context) => {
			const theme = context.globals.theme as string;
			useEffect(() => {
				if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
				else document.documentElement.removeAttribute("data-theme");
			}, [theme]);
			return (
				<div style={{ background: "var(--canvas)", height: "100vh" }}>
					<Story />
				</div>
			);
		},
	],
};

export default preview;
