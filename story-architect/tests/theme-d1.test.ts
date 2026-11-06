import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, isThemedPath, parseTheme, toggleTheme } from "../src/lib/ux/theme";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const P = "src/app/projects/[id]/";
const C = P + "chapters/[chapterId]/";
function walk(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((n) => {
    const rel = dir + "/" + n;
    return statSync(join(process.cwd(), rel)).isDirectory() ? walk(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
}
const MIGRATED = walk("src/app").filter((f) => !f.includes("/export/"));

describe("тема: чистые функции", () => {
  it("по умолчанию тёмная, переключение в обе стороны", () => {
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("мусор")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
    expect(toggleTheme("light")).toBe("dark");
  });
  it("тёмной считаются все страницы, кроме печатного экспорта", () => {
    expect(isThemedPath("/projects/p1")).toBe(true);
    expect(isThemedPath("/projects/p1/chapters/c1")).toBe(true);
    expect(isThemedPath("/projects/p1/chapters/c1/legacy")).toBe(true);
    expect(isThemedPath("/projects/p1/proposals")).toBe(true);
    expect(isThemedPath("/dashboard")).toBe(true);
    expect(isThemedPath("/projects/p1/export")).toBe(false);
    expect(isThemedPath(null)).toBe(false);
  });
  it("скрипт ранней установки темы не падает без хранилища", () => {
    expect(THEME_INIT_SCRIPT).toContain("try{");
    expect(THEME_INIT_SCRIPT).toContain("catch");
  });
});

describe("тема: стили и подключение", () => {
  const css = read("src/app/globals.css");
  it("обе темы определяют одинаковый набор переменных", () => {
    const names = (block: string) => [...block.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]!).filter((n) => !n.startsWith("font")).sort();
    const dark = css.slice(css.indexOf(":root"), css.indexOf('html[data-theme="light"]'));
    const light = css.slice(css.indexOf('html[data-theme="light"]'), css.indexOf("html { background"));
    expect(names(dark)).toEqual(names(light));
    expect(names(dark)).toContain("accent");
  });
  it("все используемые в коде переменные --имя объявлены", () => {
    const declared = new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
    const used = new Set<string>();
    for (const f of MIGRATED) for (const m of read(f).matchAll(/var\(--([a-z0-9-]+)\)/g)) used.add(m[1]!);
    const missing = [...used].filter((n) => !declared.has(n) && !n.startsWith("font"));
    expect(missing).toEqual([]);
  });
  it("в переведённых файлах не осталось жёстких цветов (кроме теней)", () => {
    for (const f of MIGRATED) {
      const hex = read(f).split("\n").filter((l) => /#[0-9a-fA-F]{3,6}\b/.test(l) && !/shadow/i.test(l));
      expect(hex, f).toEqual([]);
    }
  });
  it("корневой макет подключает стили, шрифты, тему; навигация и панель имеют переключатель и свою тему", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('import "./globals.css"');
    expect(layout).toContain("Onest");
    expect(layout).toContain("Lora");
    expect(layout).toContain("suppressHydrationWarning");
    expect(read(P + "_components/ProjectNav.tsx")).toContain("<ThemeToggle />");
    expect(read(P + "_components/ProjectNav.tsx")).toContain("theme-user");
    expect(read(P + "_components/CoauthorDock.tsx")).toContain("theme-user");
  });
  it("текст главы набирается шрифтом для чтения", () => {
    expect(read(C + "DraftEditor.tsx")).toContain("var(--font-read)");
  });
  it("тема ничего не делает с данными: переключатель только меняет атрибут и хранилище браузера", () => {
    const t = read("src/components/ThemeToggle.tsx");
    expect(t).not.toMatch(/fetch\(|prisma/);
  });
});

import { statusTone } from "../src/lib/ux/status";
import { STATUS_LABEL } from "../src/lib/ux/nav";

describe("d3: шрифты, кнопки и бейджи статуса", () => {
  it("у каждого статуса главы есть цветовой тон, неизвестный — нейтральный", () => {
    for (const s of Object.keys(STATUS_LABEL)) expect(statusTone(s)).toBeTruthy();
    expect(statusTone("IDEA")).toBe("neutral");
    expect(statusTone("APPROVED")).toBe("ok");
    expect(statusTone("CANON")).toBe("accent");
    expect(statusTone("???")).toBe("neutral");
  });
  it("бейдж используется на столе, в списке глав и в шапке главы; стили тонов есть в CSS", () => {
    const css = read("src/app/globals.css");
    for (const t of ["info", "warn", "violet", "ok", "accent"]) expect(css).toContain(`.sa-status-${t}`);
    for (const f of [P + "chapters/page.tsx", P + "_components/ProjectSummaryView.tsx", C + "ChapterWorkspace.tsx", C + "legacy/page.tsx"]) expect(read(f), f).toContain("<StatusBadge");
    expect(read(C + "ChapterWorkspace.tsx")).toContain('aria-label="Статус главы"');
  });
  it("шрифты Onest и Lora; кнопки и ссылки имеют общий базовый вид", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("Onest");
    expect(layout).toContain("Lora");
    expect(layout).not.toContain("Inter");
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\nbutton \{[^}]*background: var\(--surface-2\)/);
    expect(css).toContain("text-underline-offset");
  });
});
