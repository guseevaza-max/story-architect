"use client";

import { useEffect, useState } from "react";
import { THEME_KEY, parseTheme, toggleTheme, type Theme } from "@/lib/ux/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(parseTheme(document.documentElement.getAttribute("data-theme")));
  }, []);

  function onClick() {
    const next = toggleTheme(theme);
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // хранилище недоступно — тема действует до перезагрузки
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="sa-btn"
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      style={{ padding: "4px 10px" }}
    >
      {theme === "dark" ? "☀ Светлая" : "☾ Тёмная"}
    </button>
  );
}
