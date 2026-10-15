export type Theme = "dark" | "light" | "system";
const key = "balance.appearance";
export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    if (value === "light" || value === "system") return value;
  } catch {}
  return "dark";
}
export function applyTheme(value: Theme) {
  const dark =
    value === "dark" ||
    (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#081a30" : "#ffffff");
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
export function setTheme(value: Theme) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  applyTheme(value);
  window.dispatchEvent(new Event("balance-appearance"));
}
applyTheme(savedTheme());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (savedTheme() === "system") applyTheme("system");
});
