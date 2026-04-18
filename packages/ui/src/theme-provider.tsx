"use client";

import * as React from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sparkflow-theme";

export type ThemeProviderProps = {
  children: React.ReactNode;
  /** Initial theme preference before hydration reads localStorage. */
  defaultTheme?: Theme;
  /** Storage key override (tests / multi-app scenarios). */
  storageKey?: string;
  /** Disable transitions while the theme class is swapping. */
  disableTransitionOnChange?: boolean;
};

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined,
);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredTheme(storageKey: string, fallback: Theme): Theme {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Access can throw in sandboxed iframes; fall through to default.
  }
  return fallback;
}

function applyThemeClass(resolved: ResolvedTheme, disableTransition: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  let restoreTransitions: (() => void) | null = null;
  if (disableTransition) {
    const style = document.createElement("style");
    style.appendChild(
      document.createTextNode(
        "*,*::before,*::after{transition:none !important;animation-duration:0s !important}",
      ),
    );
    document.head.appendChild(style);
    restoreTransitions = () => {
      // Force a reflow so the style takes effect before removal.
      void window.getComputedStyle(document.body).opacity;
      style.remove();
    };
  }

  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  root.setAttribute("data-theme", resolved);

  restoreTransitions?.();
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = THEME_STORAGE_KEY,
  disableTransitionOnChange = true,
}: ThemeProviderProps): React.JSX.Element {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] =
    React.useState<ResolvedTheme>("light");

  // Hydrate from storage once on mount.
  React.useEffect(() => {
    const stored = readStoredTheme(storageKey, defaultTheme);
    setThemeState(stored);
  }, [defaultTheme, storageKey]);

  // Resolve + apply whenever theme changes, and subscribe to system changes.
  React.useEffect(() => {
    const resolve = (): ResolvedTheme =>
      theme === "system" ? getSystemTheme() : theme;

    const apply = () => {
      const next = resolve();
      setResolvedTheme(next);
      applyThemeClass(next, disableTransitionOnChange);
    };

    apply();

    if (theme !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => apply();
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme, disableTransitionOnChange]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, next);
        } catch {
          // Ignore storage failures.
        }
      }
    },
    [storageKey],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a <ThemeProvider>.");
  }
  return ctx;
}
