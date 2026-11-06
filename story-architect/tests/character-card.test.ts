import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attributeLabel, relationLabel, chapterWindow, currentStates, knowledgeLabel, valueText } from "@/lib/ux/characterCard";

const h = vi.hoisted(() => ({ project: null as any, character: null as any, charWhere: null as any }));
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: async () => h.project },
    character: { findFirst: async (a: any) => ((h.charWhere = a), h.character) },
  },
}));
import { loadCharacterCard } from "@/lib/characters/loadCharacterCard";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const row = (attribute: string, ch: number | null, at: string, v: unknown = "x") => ({ id: attribute + ch + at, attribute, newValue: v, reason: null, chapterNumber: ch, createdAt: at });

describe("карточка персонажа: чистые функции", () => {
  it("текущее состояние = последняя глава, а не последняя запись", () => {
    const cur = currentStates([row("location", 5, "2026-01-02", "дом"), row("location", 3, "2026-01-09", "порт"), row("alive", 1, "2026-01-01", true)]);
    expect(cur.find((r) => r.attribute === "location")!.newValue).toBe("дом");
    expect(cur.map((r) => r.attribute)).toEqual(["alive", "location"]);
  });
  it("подписи", () => {
    expect(valueText(null)).toBe("—");
    expect(valueText({ a: 1 })).toBe('{"a":1}');
    expect(chapterWindow(2, 7)).toBe("гл. 2–7");
    expect(chapterWindow(2, null)).toBe("с гл. 2");
    expect(chapterWindow(null, null)).toBe("");
    expect(chapterWindow(1, 1)).toBe("гл. 1");
    expect(attributeLabel("worldview")).toBe("Мировоззрение");
    expect(attributeLabel("Other")).toBe("Прочее");
    expect(attributeLabel("custom_attr")).toBe("custom_attr");
    expect(relationLabel("trust")).toBe("доверие");
    expect(relationLabel("other")).toBe("прочее");
    expect(relationLabel("mentor")).toBe("mentor");
    expect(knowledgeLabel(false, false, null)).toBe("не знает");
    expect(knowledgeLabel(true, true, 4)).toBe("знает частично с гл. 4");
  });
});

describe("загрузка карточки: доступ и Canon", () => {
  beforeEach(() => {
    h.project = { id: "p1", name: "П" };
    h.character = { id: "c1", name: "Лиа", states: [], arcs: [], relFrom: [], relTo: [], knowledge: [] };
  });
  it("чужой проект или нет персонажа — null", async () => {
    h.project = null;
    expect(await loadCharacterCard("u", "p1", "c1")).toBeNull();
    h.project = { id: "p1", name: "П" };
    h.character = null;
    expect(await loadCharacterCard("u", "p1", "c1")).toBeNull();
  });
  it("берёт только Canon и только этого проекта", async () => {
    const data = await loadCharacterCard("u", "p1", "c1");
    expect(data!.character.name).toBe("Лиа");
    expect(h.charWhere.where).toMatchObject({ id: "c1", projectId: "p1", status: "CANON" });
    for (const k of ["states", "relFrom", "relTo", "knowledge"]) expect(h.charWhere.include[k].where).toEqual({ status: "CANON" });
  });
});

describe("страница карточки только читает", () => {
  const page = read("src/app/projects/[id]/characters/[characterId]/page.tsx");
  it("без форм, кнопок и запросов", () => {
    expect(page).not.toMatch(/<form|<button|fetch\(|"use client"|prisma\./);
    expect(page).toContain("только для чтения");
  });
  it("список ведёт на карточку", () => {
    expect(read("src/app/projects/[id]/characters/page.tsx")).toContain("/characters/${character.id}");
  });
});
