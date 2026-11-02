# UI

`@henglosio/ui`

The Henglos IO design system.

## What it does

- Buttons, inputs, menus, dialogs and the other building blocks of the interface.
- The colors, fonts and spacing that give Henglos IO its look.

## Where it fits

The studio and the website are built with it, so they look and behave alike.

## Use it in your project

It needs React 19 and Tailwind CSS 4:

```bash
npm install @henglosio/ui react react-dom radix-ui gsap lucide-react tailwindcss
```

Import the stylesheet in your CSS — it brings Tailwind and the design tokens along:

```css
@import "@henglosio/ui/globals.css";
```

```tsx
import { Button } from "@henglosio/ui";

<Button.Root>Save</Button.Root>
```

## License

Part of Henglos IO, distributed under the [Sustainable Use License](LICENSE).
