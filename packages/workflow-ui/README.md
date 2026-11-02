# Workflow UI

`@henglosio/workflow-ui`

The workflow canvas, as ready-made React components.

## What it does

- Draws a workflow — its actions and wires — on a canvas.
- Offers a read-only viewer and a simulated run, used for previews and in the docs.

## Where it fits

The studio and the website use it, so a workflow looks the same wherever it's shown.

## Use it in your project

It needs React 19 and Tailwind CSS 4:

```bash
npm install @henglosio/workflow-ui react react-dom @xyflow/react radix-ui gsap lucide-react yjs tailwindcss
```

In your CSS, import the design system's stylesheet and point Tailwind at this package's classes
(the path is relative to the CSS file):

```css
@import "@henglosio/ui/globals.css";
@source "../node_modules/@henglosio/workflow-ui/dist";
```

```tsx
import { WorkflowViewer } from "@henglosio/workflow-ui";

<WorkflowViewer workflow={workflow} />
```

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
