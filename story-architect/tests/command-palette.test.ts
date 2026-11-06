import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCommands, isPaletteShortcut, moveSelection, normalizeText, searchCommands, type ChapterLite } from "../src/lib/ux/commands";
import { allNavHrefs } from "../src/lib/ux/nav";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ch = (id: string, number: number, title: string | null, status = "IDEA", bookNumber = 1): ChapterLite => ({ id, number, title, status, bookNumber });
const items = buildCommands("p", [ch("a", 1, "Начало"), ch("b", 3, "Ёжик в тумане", "DRAFT"), ch("c", 13, null, "CANON")]);

describe("быстрый переход: набор команд", () => {
  it("содержит все прежние адреса навигации и все главы", () => {
    const hrefs = items.map((i) => i.href);
    for (const h of allNavHrefs("p")) expect(hrefs).toContain(h);
    expect(hrefs).toContain("/projects/p/chapters/a");
    expect(items.filter((i) => i.group === "Главы")).toHaveLength(3);
  });
  it("подпись главы: книга и статус", () => {
    expect(items.find((i) => i.id === "chapter:b")?.hint).toBe("Книга 1 · Черновик");
  });
});

describe("быстрый переход: поиск", () => {
  it("пустой запрос — первые элементы, регистр и «ё» не мешают", () => {
    expect(searchCommands(items, "").length).toBeGreaterThan(0);
    expect(normalizeText("  ЁЖИК   в Тумане ")).toBe("ежик в тумане");
    expect(searchCommands(items, "ЕЖИК")[0]?.id).toBe("chapter:b");
  });
  it("находит раздел по началу слова и по подсказке", () => {
    expect(searchCommands(items, "can")[0]?.label).toBe("Canon");
    expect(searchCommands(items, "хроно")[0]?.label).toBe("Хронология");
    expect(searchCommands(items, "бюджет").map((i) => i.label)).toContain("Расходы ИИ");
  });
  it("«3» — глава 3 выше главы 13; несколько слов должны совпасть все", () => {
    const r = searchCommands(items, "глава 3");
    expect(r[0]?.id).toBe("chapter:b");
    expect(searchCommands(items, "глава туман").map((i) => i.id)).toEqual(["chapter:b"]);
    expect(searchCommands(items, "несуществующее")).toEqual([]);
  });
  it("количество результатов ограничено", () => {
    expect(searchCommands(items, "", 3)).toHaveLength(3);
  });
});

describe("быстрый переход: клавиши", () => {
  it("Ctrl+K и Cmd+K", () => {
    expect(isPaletteShortcut({ key: "k", ctrlKey: true, metaKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: "K", ctrlKey: false, metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "k", ctrlKey: false, metaKey: false })).toBe(false);
    expect(isPaletteShortcut({ key: "j", ctrlKey: true, metaKey: false })).toBe(false);
  });
  it("стрелки идут по кругу", () => {
    expect(moveSelection(0, "ArrowUp", 4)).toBe(3);
    expect(moveSelection(3, "ArrowDown", 4)).toBe(0);
    expect(moveSelection(2, "x", 4)).toBe(2);
    expect(moveSelection(0, "ArrowDown", 0)).toBe(0);
  });
});

describe("боковая навигация: разметка и безопасность", () => {
  const nav = read("src/app/projects/[id]/_components/ProjectNav.tsx");
  const palette = read("src/app/projects/[id]/_components/CommandPalette.tsx");
  const layout = read("src/app/projects/[id]/layout.tsx");
  it("боковая панель с группами, поиском, темой и меню для узких экранов", () => {
    expect(nav).toContain('aria-label="Разделы проекта"');
    expect(nav).toContain("sa-side");
    expect(nav).toContain("Ctrl K");
    expect(nav).toContain("<ThemeToggle />");
    expect(nav).toContain("☰ Меню");
    expect(nav).toContain("isNavHidden(pathname)");
    const css = read("src/app/globals.css");
    expect(css).toMatch(/max-width: 900px\)[\s\S]*sa-side-open/);
  });
  it("layout отдаёт главы из базы только владельцу проекта (чтение) и сохраняет Соавтора", () => {
    expect(layout).toContain("<ProjectNav");
    expect(layout).toContain("CoauthorDock");
    expect(layout).toMatch(/userId: session\.user\.id/);
    expect(layout).not.toMatch(/\.(create|update|upsert|delete)\(/);
  });
  it("поиск работает как диалог с клавиатурой и никуда не отправляет запросы", () => {
    expect(palette).toContain('role="dialog"');
    expect(palette).toContain('role="combobox"');
    expect(palette).toContain('role="listbox"');
    expect(palette).toContain("Escape");
    expect(palette).not.toMatch(/fetch\(|runTrackedAiCall/);
  });
});
