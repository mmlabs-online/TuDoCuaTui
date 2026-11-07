export const THEME_KEY = "tu-do-theme";

/** Applies the saved theme before the first render so the login screen matches it. */
export function applySavedTheme(): void {
  let dark = false;
  try {
    dark = localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    // storage unavailable: stay light
  }
  document.documentElement.classList.toggle("dark", dark);
}
