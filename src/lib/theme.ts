export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "swiftmask:theme";

const VALID_THEMES: readonly Theme[] = ["system", "light", "dark"];

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" &&
    (VALID_THEMES as readonly string[]).includes(value)
  );
}

/** Read the persisted override from localStorage; `null` if unset/invalid. */
export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(raw)) return raw;
  } catch {
    // localStorage may be unavailable (private mode / SSR guard); ignore.
  }
  return null;
}

/** Persist the user's choice. `system` is stored too, so a re-launch keeps it. */
export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore quota / disabled storage — theme still applies for this session.
  }
}

/**
 * Apply a theme to the document. `system` clears the override so the CSS
 * `@media (prefers-color-scheme)` rules drive it natively (and follow OS
 * changes live without a JS listener). Explicit choices set `data-theme`.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}
