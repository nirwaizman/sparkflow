/**
 * SparkFlow semantic design tokens.
 *
 * The palette is a modern, accessible set built around an indigo/violet primary
 * (SparkFlow brand) with neutral slate surfaces. Dark values are tuned for
 * comfortable contrast on OLED/dark backgrounds. Every token is expressed as
 * `hsl(H S% L%)` space-separated components so it plugs directly into the
 * Tailwind `hsl(var(--token) / <alpha>)` pattern.
 */

export type ColorShade = {
  readonly DEFAULT: string;
  readonly foreground: string;
};

export type ColorTokens = {
  readonly bg: string;
  readonly fg: string;
  readonly muted: ColorShade;
  readonly subtle: ColorShade;
  readonly card: ColorShade;
  readonly popover: ColorShade;
  readonly border: string;
  readonly input: string;
  readonly ring: string;
  readonly primary: ColorShade;
  readonly secondary: ColorShade;
  readonly accent: ColorShade;
  readonly success: ColorShade;
  readonly warning: ColorShade;
  readonly danger: ColorShade;
};

export const colors = {
  light: {
    bg: "0 0% 100%",
    fg: "222 47% 11%",
    muted: { DEFAULT: "210 40% 96%", foreground: "215 16% 47%" },
    subtle: { DEFAULT: "210 40% 98%", foreground: "215 25% 27%" },
    card: { DEFAULT: "0 0% 100%", foreground: "222 47% 11%" },
    popover: { DEFAULT: "0 0% 100%", foreground: "222 47% 11%" },
    border: "214 32% 91%",
    input: "214 32% 91%",
    ring: "250 84% 60%",
    primary: { DEFAULT: "250 84% 60%", foreground: "0 0% 100%" },
    secondary: { DEFAULT: "210 40% 96%", foreground: "222 47% 11%" },
    accent: { DEFAULT: "262 83% 58%", foreground: "0 0% 100%" },
    success: { DEFAULT: "142 72% 38%", foreground: "0 0% 100%" },
    warning: { DEFAULT: "38 92% 50%", foreground: "30 60% 10%" },
    danger: { DEFAULT: "0 84% 60%", foreground: "0 0% 100%" },
  },
  dark: {
    bg: "222 47% 6%",
    fg: "210 40% 98%",
    muted: { DEFAULT: "217 33% 17%", foreground: "215 20% 65%" },
    subtle: { DEFAULT: "222 47% 9%", foreground: "210 40% 96%" },
    card: { DEFAULT: "222 47% 8%", foreground: "210 40% 98%" },
    popover: { DEFAULT: "222 47% 8%", foreground: "210 40% 98%" },
    border: "217 33% 20%",
    input: "217 33% 20%",
    ring: "250 84% 66%",
    primary: { DEFAULT: "250 84% 66%", foreground: "222 47% 6%" },
    secondary: { DEFAULT: "217 33% 17%", foreground: "210 40% 98%" },
    accent: { DEFAULT: "262 83% 68%", foreground: "222 47% 6%" },
    success: { DEFAULT: "142 66% 45%", foreground: "0 0% 100%" },
    warning: { DEFAULT: "38 92% 55%", foreground: "30 60% 10%" },
    danger: { DEFAULT: "0 72% 55%", foreground: "0 0% 100%" },
  },
} as const satisfies Record<"light" | "dark", ColorTokens>;

export const radii = {
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  "2xl": "1.25rem",
  "3xl": "1.5rem",
  full: "9999px",
} as const;

export const spacing = {
  px: "1px",
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
} as const;

export const shadows = {
  xs: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.08)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.10)",
  glow: "0 0 0 1px hsl(var(--ring) / 0.25), 0 8px 24px -8px hsl(var(--primary) / 0.35)",
} as const;

export const typography = {
  fontFamily: {
    sans: [
      "Inter",
      "ui-sans-serif",
      "system-ui",
      "-apple-system",
      "Segoe UI",
      "Rubik",
      "Assistant",
      "Arial",
      "sans-serif",
    ],
    mono: [
      "JetBrains Mono",
      "ui-monospace",
      "SFMono-Regular",
      "Menlo",
      "monospace",
    ],
  },
  fontSize: {
    xs: ["0.75rem", { lineHeight: "1rem" }],
    sm: ["0.875rem", { lineHeight: "1.25rem" }],
    base: ["1rem", { lineHeight: "1.5rem" }],
    lg: ["1.125rem", { lineHeight: "1.75rem" }],
    xl: ["1.25rem", { lineHeight: "1.75rem" }],
    "2xl": ["1.5rem", { lineHeight: "2rem" }],
    "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
    "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
  },
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;

/**
 * Emit CSS variable declarations for both color schemes. Consumed by the
 * theme provider / globals.css to keep a single source of truth.
 */
function toCssVars(palette: ColorTokens): Record<string, string> {
  return {
    "--bg": palette.bg,
    "--fg": palette.fg,
    "--muted": palette.muted.DEFAULT,
    "--muted-foreground": palette.muted.foreground,
    "--subtle": palette.subtle.DEFAULT,
    "--subtle-foreground": palette.subtle.foreground,
    "--card": palette.card.DEFAULT,
    "--card-foreground": palette.card.foreground,
    "--popover": palette.popover.DEFAULT,
    "--popover-foreground": palette.popover.foreground,
    "--border": palette.border,
    "--input": palette.input,
    "--ring": palette.ring,
    "--primary": palette.primary.DEFAULT,
    "--primary-foreground": palette.primary.foreground,
    "--secondary": palette.secondary.DEFAULT,
    "--secondary-foreground": palette.secondary.foreground,
    "--accent": palette.accent.DEFAULT,
    "--accent-foreground": palette.accent.foreground,
    "--success": palette.success.DEFAULT,
    "--success-foreground": palette.success.foreground,
    "--warning": palette.warning.DEFAULT,
    "--warning-foreground": palette.warning.foreground,
    "--danger": palette.danger.DEFAULT,
    "--danger-foreground": palette.danger.foreground,
  };
}

export const cssVars = {
  light: toCssVars(colors.light),
  dark: toCssVars(colors.dark),
} as const;

export const tokens = {
  colors,
  radii,
  spacing,
  shadows,
  typography,
  cssVars,
} as const;

export type Tokens = typeof tokens;
