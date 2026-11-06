"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildCommands, isPaletteShortcut, moveSelection, searchCommands, type ChapterLite } from "@/lib/ux/commands";

/** Быстрый переход по разделам и главам: Ctrl+K. Только навигация, без запросов и ИИ. */
export default function CommandPalette({ projectId, chapters, open, onClose, onOpen }: { projectId: string; chapters: ChapterLite[]; open: boolean; onClose: () => void; onOpen: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMemo(() => buildCommands(projectId, chapters), [projectId, chapters]);
  const results = useMemo(() => searchCommands(items, query), [items, query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isPaletteShortcut(e)) {
        e.preventDefault();
        if (open) onClose();
        else onOpen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpen, onClose]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div className="sa-palette-backdrop" onMouseDown={onClose}>
      <div className="sa-palette theme-user" role="dialog" aria-modal="true" aria-label="Быстрый переход" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Куда перейти? Раздел или глава…"
          aria-label="Поиск по разделам и главам"
          role="combobox"
          aria-expanded="true"
          aria-controls="sa-palette-list"
          aria-activedescendant={results[index] ? `sa-opt-${index}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => moveSelection(i, e.key, results.length));
            } else if (e.key === "Enter" && results[index]) {
              e.preventDefault();
              go(results[index]!.href);
            }
          }}
          style={{ width: "100%", boxSizing: "border-box", padding: "14px 16px", fontSize: 16, border: 0, borderBottom: "1px solid var(--border)", borderRadius: "12px 12px 0 0", background: "transparent" }}
        />
        <ul id="sa-palette-list" role="listbox" style={{ listStyle: "none", margin: 0, padding: 6, maxHeight: 360, overflow: "auto" }}>
          {results.length === 0 && <li style={{ padding: 14, color: "var(--muted)" }}>Ничего не найдено.</li>}
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`sa-opt-${i}`}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(r.href)}
              style={{ padding: "9px 12px", borderRadius: 8, cursor: "pointer", background: i === index ? "var(--surface-3)" : "transparent", display: "flex", justifyContent: "space-between", gap: 12 }}
            >
              <span>{r.label}</span>
              <span style={{ color: "var(--muted)", fontSize: 13, whiteSpace: "nowrap" }}>{r.group === "Главы" ? r.hint : r.group}</span>
            </li>
          ))}
        </ul>
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", color: "var(--faint)", fontSize: 12 }}>↑↓ выбор · Enter открыть · Esc закрыть</div>
      </div>
    </div>
  );
}
