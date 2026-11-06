/** Тема интерфейса: «dark» по умолчанию, выбор хранится в браузере. */
export type Theme = "dark" | "light";
export const THEME_KEY = "sa-theme";

export function parseTheme(value: unknown): Theme {
  return value === "light" ? "light" : "dark";
}

export function toggleTheme(t: Theme): Theme {
  return t === "dark" ? "light" : "dark";
}

/**
 * Страницы в тёмной теме — все, кроме экспорта: он нужен для печати книги
 * и всегда остаётся светлым.
 */
export function isThemedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return !/^\/projects\/[^/]+\/export\/?$/.test(pathname);
}

/** Скрипт, выставляющий тему до первой отрисовки (без вспышки). */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){}`;
