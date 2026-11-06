import { STATUS_LABEL, allNavHrefs, navGroups, navTools } from "./nav";

/** Быстрый переход (Ctrl+K): чистые функции без обращений к базе и ИИ. */
export type CommandItem = { id: string; label: string; hint: string; href: string; group: "Разделы" | "Главы" };
export type ChapterLite = { id: string; number: number; title: string | null; status: string; bookNumber: number };

export function buildCommands(projectId: string, chapters: ChapterLite[]): CommandItem[] {
  const items: CommandItem[] = [];
  for (const g of navGroups(projectId)) {
    for (const i of g.items) items.push({ id: `nav:${i.key}`, label: i.label, hint: i.hint, href: i.href, group: "Разделы" });
  }
  for (const t of navTools(projectId)) items.push({ id: `nav:${t.key}`, label: t.label, hint: t.hint, href: t.href, group: "Разделы" });
  const sorted = [...chapters].sort((a, b) => a.bookNumber - b.bookNumber || a.number - b.number);
  for (const c of sorted) {
    items.push({
      id: `chapter:${c.id}`,
      label: `Глава ${c.number}${c.title ? ` — ${c.title}` : ""}`,
      hint: `Книга ${c.bookNumber} · ${STATUS_LABEL[c.status] ?? c.status}`,
      href: `/projects/${projectId}/chapters/${c.id}`,
      group: "Главы",
    });
  }
  return items;
}

/** Нижний регистр, «ё» → «е», лишние пробелы убраны. */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/**
 * Поиск по словам запроса: каждое слово должно встретиться в названии или подсказке.
 * Выше те, где слово начинает название или слово названия. Пустой запрос — первые limit.
 */
export function searchCommands(items: CommandItem[], query: string, limit = 12): CommandItem[] {
  const q = normalizeText(query);
  if (!q) return items.slice(0, limit);
  const words = q.split(" ");
  const scored: { item: CommandItem; score: number; i: number }[] = [];
  items.forEach((item, i) => {
    const label = normalizeText(item.label);
    const hint = normalizeText(item.hint);
    let score = 0;
    for (const w of words) {
      if (label.startsWith(w)) score += 4;
      else if (label.split(/[\s—-]+/).some((p) => p.startsWith(w))) score += 3;
      else if (label.includes(w)) score += 2;
      else if (hint.includes(w)) score += 1;
      else return;
    }
    // число в запросе совпадает с номером главы точно: «3» → «Глава 3», а не «Глава 13»
    if (item.group === "Главы" && words.some((w) => /^\d+$/.test(w) && new RegExp(`(^| )${w}( |$)`).test(label))) score += 3;
    scored.push({ item, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit).map((s) => s.item);
}

/** Перемещение выделения стрелками с переходом по кругу. */
export function moveSelection(index: number, key: string, count: number): number {
  if (count <= 0) return 0;
  if (key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowUp") return (index - 1 + count) % count;
  return index;
}

/** Сочетание клавиш открытия поиска: Ctrl+K или Cmd+K. */
export function isPaletteShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
}

export { allNavHrefs };
