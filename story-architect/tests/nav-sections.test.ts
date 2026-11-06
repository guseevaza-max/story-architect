import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activeSection, allNavHrefs, navGroups, navSections } from "../src/lib/ux/nav";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const P = "p1";

describe("разделы направлений", () => {
  it("«Вселенная»: Материалы, Сущности, Canon и память, порядок страниц сохранён", () => {
    const s = navSections(P, "universe");
    expect(s.map((x) => x.label)).toEqual(["Материалы", "Сущности", "Canon и память"]);
    expect(s[0]!.items.map((i) => i.key)).toEqual(["story-bible", "lore", "references"]);
    expect(s[1]!.items.map((i) => i.key)).toEqual(["characters", "world", "relationships"]);
    expect(s[2]!.items.map((i) => i.key)).toEqual(["canon", "memory"]);
    expect(s[0]!.href).toBe("/projects/p1/story-bible");
  });
  it("«Сюжет»: один раздел из трёх страниц; одиночные направления — по странице", () => {
    expect(navSections(P, "plot")).toHaveLength(1);
    expect(navSections(P, "plot")[0]!.items).toHaveLength(3);
    expect(navSections(P, "books")[0]!.items).toHaveLength(1);
    expect(navSections(P, "decisions")[0]!.items).toHaveLength(1);
  });
  it("все страницы по-прежнему доступны: ничего не потеряно", () => {
    const fromSections = (["dashboard", "books", "universe", "plot", "decisions"] as const).flatMap((g) => navSections(P, g).flatMap((s) => s.items.map((i) => i.href)));
    expect(fromSections.sort()).toEqual(navGroups(P).flatMap((g) => g.items.map((i) => i.href)).sort());
    expect(allNavHrefs(P)).toContain("/projects/p1/relationships");
    expect(allNavHrefs(P)).toContain("/projects/p1/timeline");
  });
  it("activeSection по адресу, в том числе для вложенных страниц", () => {
    expect(activeSection("/projects/p1/lore", P)?.label).toBe("Материалы");
    expect(activeSection("/projects/p1/lore/m1", P)?.label).toBe("Материалы");
    expect(activeSection("/projects/p1/relationships", P)?.label).toBe("Сущности");
    expect(activeSection("/projects/p1/memory", P)?.label).toBe("Canon и память");
    expect(activeSection("/projects/p1/timeline", P)?.items).toHaveLength(3);
    expect(activeSection("/projects/p1/export", P)).toBeNull();
    expect(activeSection("/projects/other/lore", P)).toBeNull();
  });
});

describe("вкладки раздела в интерфейсе", () => {
  const nav = read("src/app/projects/[id]/_components/ProjectNav.tsx");
  it("над страницей — вкладки только при нескольких страницах раздела, с aria-current", () => {
    expect(nav).toContain("section.items.length > 1");
    expect(nav).toContain('className="sa-subtabs"');
    expect(nav).toContain('aria-current={i.key === itemKey ? "page" : undefined}');
  });
  it("в боковой панели вместо всех страниц — разделы направления", () => {
    expect(nav).toContain("navSections(projectId, g.key)");
  });
  it("стили вкладок и узкий экран", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".sa-subtab[aria-current=\"page\"]");
    expect(css).toMatch(/max-width: 900px\)[^}]*sa-subtabs/);
  });
});
