import { describe, expect, it } from "vitest";
import {
  buildProposalDrafts,
  emptyExistingSets,
  looksUnnamed,
  normalizeName,
  splitNameDescription,
} from "../src/lib/storyBible/analysisToProposals";
import { proposalPayloadSchema } from "../src/lib/schemas/proposal";

const analysis = {
  characters: ["Мира Вэнс — алхимик Гильдии Стекла"],
  locations: ["Ривенхольм — город у замёрзшего моря"],
  factions: ["Гильдия Стекла"],
  worldRules: ["Лунный заряд: кристаллы можно заряжать только при свете луны"],
  events: ["Смерть кристаллов"],
  plotLines: ["Тайна умирающих кристаллов"],
  facts: ["Город стоит на берегу"],
  relationships: ["Мира доверяет Горану"],
  secrets: ["Горан скрывает правду"],
  openQuestions: ["Кто в подвале?"],
};

describe("buildProposalDrafts: преобразование категорий", () => {
  const { drafts, notMapped } = buildProposalDrafts(analysis);

  it("превращает все поддерживаемые категории в нужные типы", () => {
    const types = drafts.map((d) => `${d.category}:${d.entityType}`);
    expect(types).toEqual([
      "characters:CHARACTER",
      "locations:WORLD_ENTITY",
      "factions:WORLD_ENTITY",
      "worldRules:WORLD_RULE",
      "events:EVENT",
      "plotLines:PLOT_LINE",
      "openQuestions:OPEN_QUESTION",
    ]);
  });

  it("локации и фракции получают разные типы WORLD_ENTITY", () => {
    const entity = drafts.filter((d) => d.entityType === "WORLD_ENTITY");
    expect(entity.map((d) => d.payload.data.type)).toEqual([
      "LOCATION",
      "FACTION",
    ]);
  });

  it("каждый черновик проходит реальную Zod-схему предложений", () => {
    for (const draft of drafts) {
      expect(proposalPayloadSchema.safeParse(draft.payload).success).toBe(
        true
      );
    }
  });

  it("отношения, секреты и факты не создают предложений; вопросы создают", () => {
    expect(drafts.some((d) => d.name.includes("Горан скрывает"))).toBe(false);
    expect(drafts.some((d) => d.name.includes("Мира доверяет"))).toBe(false);
    expect(drafts.some((d) => d.entityType === "OPEN_QUESTION")).toBe(true);
    expect(notMapped).toEqual({
      facts: 1,
      relationships: 1,
      secrets: 1,
      openQuestions: 0,
    });
  });

  it("правило мира сохраняет полный текст как statement", () => {
    const rule = drafts.find((d) => d.entityType === "WORLD_RULE");
    expect(rule?.payload.data.statement).toContain("только при свете луны");
  });
});

describe("buildProposalDrafts: защита от дублей", () => {
  it("пропускает то, что уже есть в Canon", () => {
    const existing = emptyExistingSets();
    existing.canon.CHARACTER.add(normalizeName("Мира Вэнс"));
    const { drafts, skipped } = buildProposalDrafts(analysis, existing);
    expect(drafts.some((d) => d.entityType === "CHARACTER")).toBe(false);
    expect(skipped[0]?.reason).toBe("duplicate_canon");
  });

  it("пропускает то, что уже ждёт решения", () => {
    const existing = emptyExistingSets();
    existing.pending.EVENT.add(normalizeName("смерть кристаллов"));
    const { skipped } = buildProposalDrafts(analysis, existing);
    expect(skipped.map((s) => s.reason)).toContain("duplicate_pending");
  });

  it("не возвращает ранее отклонённое автором", () => {
    const existing = emptyExistingSets();
    existing.rejected.PLOT_LINE.add(
      normalizeName("Тайна умирающих кристаллов")
    );
    const { drafts, skipped } = buildProposalDrafts(analysis, existing);
    expect(drafts.some((d) => d.entityType === "PLOT_LINE")).toBe(false);
    expect(skipped.map((s) => s.reason)).toContain("previously_rejected");
  });

  it("повтор внутри одного анализа создаёт одно предложение", () => {
    const { drafts, skipped } = buildProposalDrafts({
      characters: ["Эрик Холт", "  эрик   холт "],
    });
    expect(drafts).toHaveLength(1);
    expect(skipped[0]?.reason).toBe("duplicate_in_analysis");
  });

  it("повторный запуск того же анализа не создаёт ничего нового", () => {
    const first = buildProposalDrafts(analysis);
    const existing = emptyExistingSets();
    for (const d of first.drafts) {
      existing.pending[d.entityType].add(normalizeName(d.name));
    }
    const second = buildProposalDrafts(analysis, existing);
    expect(second.drafts).toHaveLength(0);
  });
});

describe("неполные и безымянные данные", () => {
  it("пустой и частичный анализ не вызывает ошибок", () => {
    expect(buildProposalDrafts({}).drafts).toEqual([]);
    expect(buildProposalDrafts({ characters: ["", "   "] }).skipped).toHaveLength(
      2
    );
  });

  it("безымянные фигуры не становятся персонажами, но попадают в отчёт", () => {
    const { drafts, skipped } = buildProposalDrafts({
      characters: [
        "Незнакомец у входа на пристань",
        "Неизвестный человек в тёмной шапке",
        "Эрик Холт — бывший стражник",
      ],
    });
    expect(drafts.map((d) => d.name)).toEqual(["Эрик Холт"]);
    expect(skipped.map((s) => s.reason)).toEqual(["unnamed", "unnamed"]);
  });

  it("роль без имени не считается безымянной фигурой автоматически", () => {
    expect(looksUnnamed("Стражник Эрик")).toBe(false);
    expect(looksUnnamed("Незнакомка в плаще")).toBe(true);
  });

  it("безымянность проверяется только у персонажей", () => {
    const { drafts } = buildProposalDrafts({
      locations: ["Неизвестный остров"],
    });
    expect(drafts).toHaveLength(1);
  });
});

describe("splitNameDescription", () => {
  it("делит по тире и оставляет полный текст в описании", () => {
    expect(splitNameDescription("Ривенхольм — город у моря")).toEqual({
      name: "Ривенхольм",
      description: "Ривенхольм — город у моря",
    });
  });

  it("короткая строка без разделителя — это название", () => {
    expect(splitNameDescription("Гильдия Стекла")).toEqual({
      name: "Гильдия Стекла",
    });
  });

  it("длинную строку без разделителя обрезает по слову", () => {
    const text = "слово ".repeat(40).trim();
    const result = splitNameDescription(text);
    expect(result.name.length).toBeLessThanOrEqual(81);
    expect(result.name.endsWith("…")).toBe(true);
    expect(result.description).toBe(text);
  });
});
