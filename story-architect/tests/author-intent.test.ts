import { describe, expect, it } from "vitest";
import {
  AUTHOR_NOTES_MARKER,
  buildAuthorDirectionBlock,
  splitAuthorNotes,
} from "../src/lib/authorIntent/prompt";
import {
  authorIntentSchema,
  hasIntentContent,
  normalizeIntent,
  normalizeReferences,
  resolveReferences,
  type AuthorReference,
} from "../src/lib/authorIntent/schema";

function ref(partial: Partial<AuthorReference> & { id: string }): AuthorReference {
  return {
    title: `Референс ${partial.id}`,
    type: "TECHNIQUE",
    category: "OTHER",
    active: true,
    isDefault: false,
    ...partial,
  };
}

const intent = normalizeIntent({
  scale: "EPIC",
  drama: "TENSE",
  pace: "RISING",
  focus: "MYSTERY",
  readerEffect: "ощущение чего-то огромного",
  emotionalArc: "от тишины к тревоге",
  mustInclude: "реакция Системы",
  avoid: "ранняя кульминация",
  compositionNotes: "финал без разгадки",
  freePrompt: "Начать с тихой камерной сцены. Не торопить кульминацию.",
});

describe("normalizeIntent", () => {
  it("убирает пустые поля и обрезает пробелы", () => {
    const result = normalizeIntent({
      scale: "LOCAL",
      freePrompt: "  текст  ",
      readerEffect: "   ",
      pace: null,
    });
    expect(result).toEqual({ scale: "LOCAL", freePrompt: "текст" });
  });

  it("полностью пустой замысел превращается в null", () => {
    expect(normalizeIntent({})).toBeNull();
    expect(normalizeIntent({ freePrompt: "   " })).toBeNull();
    expect(normalizeIntent(null)).toBeNull();
    expect(normalizeIntent("мусор")).toBeNull();
  });

  it("неизвестное значение масштаба отвергается схемой", () => {
    expect(authorIntentSchema.safeParse({ scale: "HUGE" }).success).toBe(false);
    expect(normalizeIntent({ scale: "HUGE" })).toBeNull();
  });

  it("пустой список референсов — осознанный выбор, он сохраняется", () => {
    expect(normalizeIntent({ referenceIds: [] })).toEqual({ referenceIds: [] });
    expect(hasIntentContent(normalizeIntent({ referenceIds: [] }))).toBe(false);
  });
});

describe("resolveReferences (наследование)", () => {
  const library = [
    ref({ id: "a", isDefault: true }),
    ref({ id: "b" }),
    ref({ id: "c", isDefault: true, active: false }),
  ];

  it("без выбора в главе применяются активные референсы по умолчанию", () => {
    expect(resolveReferences(null, library).map((r) => r.id)).toEqual(["a"]);
    expect(
      resolveReferences(normalizeIntent({ scale: "LOCAL" }), library).map((r) => r.id)
    ).toEqual(["a"]);
  });

  it("явный выбор главы заменяет набор по умолчанию", () => {
    const chosen = normalizeIntent({ referenceIds: ["b"] });
    expect(resolveReferences(chosen, library).map((r) => r.id)).toEqual(["b"]);
  });

  it("пустой выбор главы отключает референсы по умолчанию", () => {
    const none = normalizeIntent({ referenceIds: [] });
    expect(resolveReferences(none, library)).toEqual([]);
  });

  it("неактивные и несуществующие референсы не применяются", () => {
    const chosen = normalizeIntent({ referenceIds: ["c", "zzz", "b"] });
    expect(resolveReferences(chosen, library).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("normalizeReferences", () => {
  it("пропускает повреждённые и повторяющиеся записи", () => {
    const result = normalizeReferences([
      { id: "a", title: "Хороший" },
      { id: "a", title: "Дубль" },
      { id: "b" },
      "мусор",
      { id: "c", title: "Ещё один", category: "DIALOGUE" },
    ]);
    expect(result.map((r) => r.id)).toEqual(["a", "c"]);
    expect(result[0]?.active).toBe(true);
  });

  it("не массив — пустая библиотека", () => {
    expect(normalizeReferences(undefined)).toEqual([]);
    expect(normalizeReferences({ id: "a" })).toEqual([]);
  });
});

describe("buildAuthorDirectionBlock", () => {
  const references = [
    ref({
      id: "r1",
      title: "Нарастание тревоги",
      source: "авторский приём",
      category: "ATMOSPHERE",
      technique: "тревога через детали и реакцию людей",
      instruction: "Не называть угрозу прямо",
      notes: "ЛИЧНАЯ ЗАМЕТКА АВТОРА",
    }),
  ];

  it("без замысла и референсов блок пустой: генерация прежняя", () => {
    for (const role of ["architect", "scene_planner", "writer", "continuity"] as const) {
      expect(buildAuthorDirectionBlock({ intent: null, references: [], role })).toBe("");
    }
  });

  it("только пустой выбор референсов тоже не меняет промпт", () => {
    expect(
      buildAuthorDirectionBlock({
        intent: normalizeIntent({ referenceIds: [] }),
        references: [],
        role: "writer",
      })
    ).toBe("");
  });

  it("содержит все настройки замысла на русском", () => {
    const block = buildAuthorDirectionBlock({ intent, references, role: "architect" });
    for (const expected of [
      "Масштабность: эпическая",
      "Драматичность: напряжённая",
      "Темп: нарастающий",
      "Основной акцент: тайна и неизвестность",
      "ощущение чего-то огромного",
      "от тишины к тревоге",
      "реакция Системы",
      "ранняя кульминация",
      "финал без разгадки",
      "Начать с тихой камерной сцены",
    ]) {
      expect(block).toContain(expected);
    }
  });

  it("передаёт приём и инструкцию референса, но не личные заметки", () => {
    const block = buildAuthorDirectionBlock({ intent, references, role: "writer" });
    expect(block).toContain("Нарастание тревоги");
    expect(block).toContain("тревога через детали");
    expect(block).toContain("Не называть угрозу прямо");
    expect(block).not.toContain("ЛИЧНАЯ ЗАМЕТКА АВТОРА");
  });

  it("задаёт иерархию: Canon выше замысла, замысел выше референсов", () => {
    const block = buildAuthorDirectionBlock({ intent, references, role: "writer" });
    const canon = block.indexOf("Системные ограничения и защита Canon");
    const facts = block.indexOf("Подтверждённые факты истории");
    const plans = block.indexOf("Утверждённый план главы и план сцен");
    const design = block.indexOf("Авторский замысел этой главы");
    const refs = block.indexOf("Выбранные референсы и общие авторские предпочтения");
    expect(canon).toBeGreaterThan(-1);
    expect(canon).toBeLessThan(facts);
    expect(facts).toBeLessThan(plans);
    expect(plans).toBeLessThan(design);
    expect(design).toBeLessThan(refs);
    expect(block).toContain("не разрешает менять утверждённые события");
  });

  it("Architect и Scene Planner сообщают о конфликте через openQuestions", () => {
    for (const role of ["architect", "scene_planner"] as const) {
      const block = buildAuthorDirectionBlock({ intent, references, role });
      expect(block).toContain("openQuestions");
      expect(block).toContain("Конфликт замысла:");
    }
  });

  it("Scene Planner просит распределить замысел по сценам", () => {
    const block = buildAuthorDirectionBlock({ intent, references, role: "scene_planner" });
    expect(block).toContain("Распредели замысел по сценам");
    expect(block).toContain("эмоциональный пик");
  });

  it("Writer получает правило раздела замечаний при конфликте", () => {
    const block = buildAuthorDirectionBlock({ intent, references, role: "writer" });
    expect(block).toContain(AUTHOR_NOTES_MARKER);
    expect(block).toContain("следуй им");
  });

  it("Continuity получает только принцип: предпочтения — не факты", () => {
    const block = buildAuthorDirectionBlock({ intent, references, role: "continuity" });
    expect(block).toContain("НЕ факты мира");
    expect(block).toContain("Не считай нарушением Canon допустимые стилистические решения");
    expect(block).not.toContain("Масштабность");
    expect(block).not.toContain("Нарастание тревоги");
    expect(block).not.toContain("Начать с тихой камерной сцены");
  });

  it("референсы по умолчанию попадают в промпт и без замысла главы", () => {
    const block = buildAuthorDirectionBlock({
      intent: null,
      references,
      role: "writer",
    });
    expect(block).toContain("Нарастание тревоги");
    expect(block).not.toContain("Масштабность");
  });
});

describe("splitAuthorNotes", () => {
  it("отделяет раздел замечаний от текста главы", () => {
    const output = `Глава начинается тихо.\n\nКонец главы.\n\n${AUTHOR_NOTES_MARKER}\nЗамысел требовал раскрыть тайну, но Canon запрещает.`;
    const { text, notes } = splitAuthorNotes(output);
    expect(text).toBe("Глава начинается тихо.\n\nКонец главы.");
    expect(notes).toBe("Замысел требовал раскрыть тайну, но Canon запрещает.");
    expect(text).not.toContain("Canon запрещает");
  });

  it("без раздела текст возвращается как есть", () => {
    expect(splitAuthorNotes("Просто текст")).toEqual({
      text: "Просто текст",
      notes: null,
    });
  });

  it("если перед разделом нет текста, ответ не теряется", () => {
    const output = `${AUTHOR_NOTES_MARKER}\nтолько замечания`;
    expect(splitAuthorNotes(output)).toEqual({ text: output, notes: null });
  });

  it("пустой раздел замечаний не создаёт пустую заметку", () => {
    expect(splitAuthorNotes(`Текст\n${AUTHOR_NOTES_MARKER}\n`)).toEqual({
      text: "Текст",
      notes: null,
    });
  });
});
