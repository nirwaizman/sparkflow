# @sparkflow/ui

SparkFlow's design system and component primitives. Built on Radix UI, Tailwind,
`class-variance-authority`, and `tailwind-merge`. First-class RTL support for
the Hebrew-speaking audience.

## Install

Already wired in the monorepo — add as a workspace dependency:

```json
{ "dependencies": { "@sparkflow/ui": "workspace:*" } }
```

## Import a component

```tsx
import { Button, Card, CardHeader, CardTitle } from "@sparkflow/ui";

export function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>שלום עולם</CardTitle>
      </CardHeader>
      <Button variant="default">שלח</Button>
    </Card>
  );
}
```

## Wire the theme provider (Next.js App Router)

Add `ThemeProvider` high in the tree (e.g. `app/layout.tsx`), and set the
language/direction on the `<html>` element:

```tsx
import { ThemeProvider } from "@sparkflow/ui";
import "@sparkflow/ui/styles/globals.css";
import "./globals.css"; // your app's Tailwind entry

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="system">{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

Switch theme imperatively:

```tsx
"use client";
import { useTheme } from "@sparkflow/ui";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      {theme}
    </button>
  );
}
```

## Import global styles

`globals.css` defines the CSS variables every primitive reads. Import it once
in your app entry:

```css
/* app/globals.css */
@import "@sparkflow/ui/styles/globals.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
```

The host app's Tailwind config already includes
`../../packages/ui/src/**/*.{ts,tsx}` in its `content`, so class names in this
package are picked up automatically.

## RTL notes

Primitives use logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`,
`end-*`, `text-start`, `text-end`) so they flip correctly under `dir="rtl"`.
Directional components (`Sheet`, `Switch`, `Progress`, chevrons in
`DropdownMenu`) use Tailwind's `rtl:` / `ltr:` variants for the cases where
logical utilities aren't enough.

## Available primitives

`Button`, `Input`, `Textarea`, `Label`, `Card` (+ Header/Title/Description/Content/Footer),
`Dialog`, `DropdownMenu`, `Toast`, `Avatar`, `Badge`, `Tooltip`, `Tabs`,
`Sheet` (sides: `start` / `end` / `top` / `bottom`), `Separator`, `ScrollArea`,
`Skeleton`, `Switch`, `Alert`, `Progress`.

Plus icons via `@sparkflow/ui` (barrel) or `@sparkflow/ui/src/icons` directly.
