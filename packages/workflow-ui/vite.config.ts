import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Storybook's build — same as the ui package's.
export default defineConfig({
	plugins: [react(), tailwindcss()],
});
