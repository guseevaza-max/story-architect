import { describe, expect, it } from "vitest";
import {
  buildNarrativeContext,
  secretLevel,
  type NarrativeBeatInput,
  type NarrativeBookInput,
  type NarrativeSecretInput,
} from "../src/lib/plotMap/narrativeContext";

const book = (over: Partial<NarrativeBookInput> = {}): NarrativeBookInput => ({
  id: "b1", title: "Параллакс", number: 1,
  premise: null, mainArc: null, plannedEnding: null, themes: null, centralConflicts: null, authorConstraints: null,
  ...over,
});
const beat = (over: Partial<NarrativeBeatInput> = {}): NarrativeBeatInput => ({
  id: "x" + Math.random(), bookId: "b1", order: 0, name: "Веха", description: null, narrativeFunction: null,
  causes: null, consequences: null, plannedChapterFrom: null, plannedChapterTo: null,
  approval: "IDEA", disclosure: "HIDDEN", ...over,
});
const secret = (over: Partial<NarrativeSecretInput> = {}): NarrativeSecretInput => ({
  id: "s1", name: "Вторая Система", importance: 5, status: "CANON", revealStatus: "SEEDED",
  objectiveTruth: "ИСТИНА-ВТОРОЙ-СИСТЕМЫ", hintFromChapter: 5, partialRevealChapter: 15, plannedRevealChapter: 25,
  forbiddenEarly: "природа Второй Системы", ...over,
});
const ctx = (chapterNumber: number, over: Partial<{ book: NarrativeBookInput | null; beats: NarrativeBeatInput[]; secrets: NarrativeSecretInput[] }> = {}) =>
  buildNarrativeContext({ chapterNumber, book: book(), beats: [], secrets: [], ...over });

describe("Narrative Context: пустые и частичные карты", () => {
  it("1. полностью пустая карта: блока нет, Writer не меняется", () => {
    const c = ctx(3);
    expect(c.isEmpty).toBe(true);
    expect(c.promptBlock).toBe("");
    expect(ctx(3, { book: null }).promptBlock).toBe("");
  });

  it("2. только замысел книги: передаются только заполненные поля", () => {
    const c = ctx(3, { book: book({ themes: "память и утрата", centralConflicts: "Салим против Системы" }) });
    expect(c.isEmpty).toBe(false);
    expect(c.promptBlock).toContain("Главные темы: память и утрата");
    expect(c.promptBlock).toContain("Центральные конфликты: Салим против Системы");
    expect(c.promptBlock).not.toContain("Предпосылка");
    expect(c.promptBlock).not.toContain("СЮЖЕТНЫЕ ВЕХИ");
  });

  it("12. авторские ограничения передаются даже при почти пустой карте", () => {
    const c = ctx(3, { book: book({ authorConstraints: "Салим не становится наместником в первой книге" }) });
    expect(c.promptBlock).toContain("ЖЁСТКИЕ АВТОРСКИЕ ОГРАНИЧЕНИЯ");
    expect(c.promptBlock).toContain("не становится наместником");
  });
});

describe("Narrative Context: вехи", () => {
  it("3–4. утверждённые и предварительные вехи различаются", () => {
    const c = ctx(3, {
      beats: [
        beat({ name: "Встреча с Кайреном", approval: "APPROVED", plannedChapterFrom: 3 }),
        beat({ name: "Идея про ведьму", approval: "IDEA", plannedChapterFrom: 4 }),
        beat({ name: "Примерная смерть отца", approval: "APPROXIMATE", plannedChapterFrom: 5 }),
      ],
    });
    expect(c.promptBlock).toContain("[УТВЕРЖДЕНО, гл. 3, читателю: скрыто] Встреча с Кайреном");
    expect(c.promptBlock).toContain("[черновая идея, гл. 4");
    expect(c.promptBlock).toContain("[примерно, гл. 5");
    expect(c.promptBlock).toContain("не строй на них необратимых событий");
    expect(c.preview.beats.current[0]?.authority).toBe("approved");
    expect(c.preview.beats.near.every((b) => b.authority === "preliminary")).toBe(true);
  });

  it("5. вехи без номера главы не получают номера и не привязываются к главе", () => {
    const c = ctx(3, { beats: [beat({ name: "Финал книги" }), beat({ name: "Ритуал ведьмы" })] });
    expect(c.preview.beats.unplaced).toHaveLength(2);
    expect(c.preview.beats.current).toHaveLength(0);
    expect(c.promptBlock).toContain("БЕЗ НОМЕРА ГЛАВЫ");
    expect(c.promptBlock).not.toMatch(/гл\. \d/);
    expect(c.preview.warnings.join(" ")).toContain("нет номеров глав");
  });

  it("6. будущая веха попадает в ближайшие или отдалённые и не считается произошедшей", () => {
    const c = ctx(3, {
      beats: [
        beat({ name: "Скоро", plannedChapterFrom: 6, approval: "APPROVED" }),
        beat({ name: "Далеко", plannedChapterFrom: 30, plannedChapterTo: 32, description: "очень длинное подробное описание" }),
        beat({ name: "Уже было", plannedChapterFrom: 1, plannedChapterTo: 2 }),
      ],
    });
    expect(c.preview.beats.near.map((b) => b.name)).toEqual(["Скоро"]);
    expect(c.preview.beats.far.map((b) => b.name)).toEqual(["Далеко"]);
    expect(c.preview.beats.past.map((b) => b.name)).toEqual(["Уже было"]);
    expect(c.promptBlock).toContain("Запланированная веха ещё не произошла");
    expect(c.promptBlock).toContain("это план, а не подтверждённые факты");
  });

  it("8. веха другой книги не переносится в эту", () => {
    const c = ctx(3, {
      beats: [
        beat({ name: "Наместничество", bookId: "b2", approval: "APPROVED", plannedChapterFrom: 3 }),
        beat({ name: "Своя веха", plannedChapterFrom: 3 }),
      ],
    });
    expect(c.promptBlock).toContain("Своя веха");
    expect(c.promptBlock).not.toContain("Наместничество");
  });

  it("9. перестановка вех меняет порядок в контексте", () => {
    const a = beat({ id: "a", name: "Первая", order: 0 });
    const b = beat({ id: "b", name: "Вторая", order: 1 });
    const before = ctx(3, { beats: [a, b] }).promptBlock;
    const after = ctx(3, { beats: [{ ...a, order: 1 }, { ...b, order: 0 }] }).promptBlock;
    expect(before.indexOf("Первая")).toBeLessThan(before.indexOf("Вторая"));
    expect(after.indexOf("Вторая")).toBeLessThan(after.indexOf("Первая"));
  });

  it("лимиты: лишние вехи не раздувают запрос, а предпросмотр говорит, сколько скрыто", () => {
    const many = Array.from({ length: 20 }, (_, i) => beat({ name: `Будущая ${i}`, order: i, plannedChapterFrom: 4 + (i % 3) }));
    const c = ctx(3, { beats: many });
    expect(c.preview.beats.near).toHaveLength(8);
    expect(c.preview.omitted.near).toBe(12);
    expect(c.promptBlock).toContain("и ещё 12");
  });
});

describe("Narrative Context: тайны и защита от раскрытия", () => {
  it("7. до главы намёков тайна скрыта, истина в запрос не попадает", () => {
    const c = ctx(3, { secrets: [secret()] });
    expect(c.preview.secrets[0]?.level).toBe("HIDDEN");
    expect(c.promptBlock).toContain("СКРЫТО");
    expect(c.promptBlock).not.toContain("ИСТИНА-ВТОРОЙ-СИСТЕМЫ");
    expect(c.promptBlock).toContain("природа Второй Системы");
  });

  it("8–10. намёки, частичное и полное раскрытие по главам", () => {
    expect(secretLevel(secret(), 4).level).toBe("HIDDEN");
    expect(secretLevel(secret(), 5).level).toBe("HINT");
    expect(secretLevel(secret(), 14).level).toBe("HINT");
    expect(secretLevel(secret(), 15).level).toBe("PARTIAL");
    expect(secretLevel(secret(), 24).level).toBe("PARTIAL");
    expect(secretLevel(secret(), 25).level).toBe("FULL");

    const hint = ctx(8, { secrets: [secret()] }).promptBlock;
    expect(hint).toContain("ТОЛЬКО НАМЁКИ");
    expect(hint).toContain("ТОЛЬКО для планирования, не излагай её в тексте");
    expect(hint).toContain("ИСТИНА-ВТОРОЙ-СИСТЕМЫ");

    expect(ctx(16, { secrets: [secret()] }).promptBlock).toContain("ЧАСТИЧНОЕ РАСКРЫТИЕ");

    const full = ctx(25, { secrets: [secret()] }).promptBlock;
    expect(full).toContain("МОЖНО РАСКРЫТЬ");
    expect(full).not.toContain("Категорически нельзя раскрывать раньше времени");
  });

  it("тайна без плана раскрытия по умолчанию скрыта и даёт предупреждение", () => {
    const s = secret({ hintFromChapter: null, partialRevealChapter: null, plannedRevealChapter: null });
    const c = ctx(40, { secrets: [s] });
    expect(c.preview.secrets[0]?.level).toBe("HIDDEN");
    expect(c.preview.warnings.join(" ")).toContain("план раскрытия не задан");
  });

  it("без частичного этапа: намёки до полного раскрытия, полного раскрытия без номера нет", () => {
    const s = secret({ partialRevealChapter: null, plannedRevealChapter: null });
    expect(secretLevel(s, 50).level).toBe("HINT");
  });

  it("11. конфликт сроков: берётся осторожный уровень и есть предупреждение", () => {
    const s = secret({ hintFromChapter: 9, partialRevealChapter: 3, plannedRevealChapter: 20 });
    const c = ctx(5, { secrets: [s] });
    expect(c.preview.secrets[0]?.level).toBe("HIDDEN");
    expect(c.preview.warnings.join(" ")).toContain("идут не по порядку");
    expect(ctx(20, { secrets: [s] }).preview.secrets[0]?.level).toBe("FULL");
  });

  it("предупреждение, если тайна помечена раскрытой раньше плана", () => {
    const c = ctx(8, { secrets: [secret({ revealStatus: "REVEALED" })] });
    expect(c.preview.warnings.join(" ")).toContain("помечена как раскрытая");
  });

  it("предложения ИИ (не CANON) в защиту не входят", () => {
    const c = ctx(8, { secrets: [secret({ status: "PROPOSAL" })] });
    expect(c.preview.secrets).toHaveLength(0);
  });

  it("запрос велит при конфликте с Canon сообщить автору, а не молча менять", () => {
    const c = ctx(8, { secrets: [secret()] });
    expect(c.promptBlock).toContain("=== ЗАМЕЧАНИЯ ДЛЯ АВТОРА ===");
    expect(c.promptBlock).toContain("Подтверждённый Canon, утверждённые планы главы и сцен");
  });
});
