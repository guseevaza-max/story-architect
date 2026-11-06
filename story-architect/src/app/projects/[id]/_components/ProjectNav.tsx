"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { activeGroup, activeItemKey, activeSection, isNavHidden, navGroups, navSections, navTools } from "@/lib/ux/nav";
import type { ChapterLite } from "@/lib/ux/commands";
import CommandPalette from "./CommandPalette";

/**
 * Боковая навигация проекта: пять направлений, подпункты активного направления,
 * инструменты, быстрый переход (Ctrl+K) и переключатель темы. На узком экране
 * меню выдвигается кнопкой «Меню». Все прежние адреса остаются рабочими.
 */
export default function ProjectNav({ projectId, pending, chapters = [], children }: { projectId: string; pending: number; chapters?: ChapterLite[]; children?: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // меню закрывается при переходе и по Esc
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (isNavHidden(pathname)) return <>{children}</>;

  const groups = navGroups(projectId);
  const group = activeGroup(pathname, projectId);
  const itemKey = activeItemKey(pathname, projectId);
  const section = activeSection(pathname, projectId);
  const tools = navTools(projectId);

  return (
    <div className="sa-shell">
      <div className="sa-topbar theme-user">
        <button type="button" className="sa-btn" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="sa-sidebar">
          ☰ Меню
        </button>
        <button type="button" className="sa-btn" onClick={openPalette} aria-label="Быстрый переход">
          🔍 Поиск
        </button>
      </div>

      {menuOpen && <div className="sa-side-backdrop" onClick={() => setMenuOpen(false)} />}

      <nav id="sa-sidebar" aria-label="Разделы проекта" className={`sa-side theme-user${menuOpen ? " sa-side-open" : ""}`}>
        <Link href="/dashboard" className="sa-side-link" style={{ color: "var(--muted)" }} title="Список проектов">
          ← Все проекты
        </Link>

        <button type="button" className="sa-side-search" onClick={openPalette}>
          <span>🔍 Поиск</span>
          <kbd>Ctrl K</kbd>
        </button>

        <div className="sa-side-groups">
          {groups.map((g) => {
            const active = g.key === group;
            return (
              <div key={g.key}>
                <Link href={g.href} className={`sa-side-link sa-side-group${active ? " sa-side-active" : ""}`} aria-current={active && g.items.length <= 1 ? "page" : undefined}>
                  <span>{g.label}</span>
                  {g.key === "decisions" && pending > 0 && <span className="sa-side-badge">{pending}</span>}
                </Link>
                {active && navSections(projectId, g.key).length > 1 && (
                  <div className="sa-side-sub">
                    {navSections(projectId, g.key).map((s) => {
                      const current = s.label === section?.label;
                      return (
                        <Link key={s.label} href={s.href} aria-current={current ? "page" : undefined} className={`sa-side-link sa-side-item${current ? " sa-side-current" : ""}`}>
                          {s.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sa-side-foot">
          {tools.map((t) => (
            <Link key={t.key} href={t.href} title={t.hint} className="sa-side-link sa-side-tool">
              {t.label}
            </Link>
          ))}
          <div style={{ marginTop: 8 }}>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <div className="sa-main">
        {section && section.items.length > 1 && (
          <nav aria-label={`Страницы раздела «${section.label}»`} className="sa-subtabs">
            {section.items.map((i) => (
              <Link key={i.key} href={i.href} title={i.hint} aria-current={i.key === itemKey ? "page" : undefined} className="sa-subtab">
                {i.label}
              </Link>
            ))}
          </nav>
        )}
        {children}
      </div>

      <CommandPalette projectId={projectId} chapters={chapters} open={paletteOpen} onClose={closePalette} onOpen={openPalette} />
    </div>
  );
}
