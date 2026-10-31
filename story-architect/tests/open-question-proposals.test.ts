import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProposalDrafts,
  emptyExistingSets,
  normalizeName,
  type Candidate,
} from "../src/lib/storyBible/analysisToProposals";
import {
  openQuestionProposalSchema,
  proposalPayloadSchema,
} from "../src/lib/schemas/proposal";

const characterCandidate: Candidate = {
  kind: "character",
  name: "Дарен Вейр",
  description: "",
  evidence: "",
  confidence: 0.9,
  isOngoing: false,
  eventGroup: "",
  cause: "",
  consequences: "",
  inWorldDate: "",
};

describe("схема предложения OPEN_QUESTION", () => {
  it("принимает вопрос с ответом и без него", () => {
    expect(
      openQuestionProposalSchema.safeParse({ question: "Кто заказчик?" }).success
    ).toBe(true);
    expect(
      openQuestionProposalSchema.safeParse({
        question: "Кто заказчик?",
        answer: "Пока неизвестно",
      }).success
    ).toBe(true);
  });

  it("отклоняет пустой и слишком длинный вопрос", () => {
    expect(openQuestionProposalSchema.safeParse({ question: "" }).success).toBe(
      false
    );
    expect(
      openQuestionProposalSchema.safeParse({ question: "?".repeat(2001) }).success
    ).toBe(false);
  });

  it("входит в общую схему предложений Canon", () => {
    const parsed = proposalPayloadSchema.safeParse({
      entityType: "OPEN_QUESTION",
      data: { question: "Кто в подвале?" },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("анализ → предложения об открытых вопросах", () => {
  it("каждый вопрос становится отдельным черновиком OPEN_QUESTION", () => {
    const { drafts } = buildProposalDrafts({
      openQuestions: ["Кто заказчик Лиоры?", "Куда ведёт старый путь?"],
    });
    expect(drafts.map((d) => d.entityType)).toEqual([
      "OPEN_QUESTION",
      "OPEN_QUESTION",
    ]);
    expect(drafts.map((d) => d.payload.data.question)).toEqual([
      "Кто заказчик Лиоры?",
      "Куда ведёт старый путь?",
    ]);
  });

  it("черновик проходит реальную Zod-схему", () => {
    const { drafts } = buildProposalDrafts({ openQuestions: ["Кто заказчик?"] });
    for (const draft of drafts) {
      expect(proposalPayloadSchema.safeParse(draft.payload).success).toBe(true);
    }
  });

  it("работает и при наличии структурированных кандидатов", () => {
    const { drafts } = buildProposalDrafts({
      candidates: [characterCandidate],
      openQuestions: ["Кто заказчик Лиоры?"],
    });
    expect(drafts.map((d) => d.entityType)).toEqual([
      "CHARACTER",
      "OPEN_QUESTION",
    ]);
  });

  it("пустые строки пропускаются с причиной", () => {
    const { drafts, skipped } = buildProposalDrafts({
      openQuestions: ["", "   "],
    });
    expect(drafts).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["empty", "empty"]);
    expect(skipped.every((s) => s.category === "openQuestions")).toBe(true);
  });

  it("не создаёт дубль вопроса, уже существующего в проекте", () => {
    const existing = emptyExistingSets();
    existing.canon.OPEN_QUESTION.add(normalizeName("Кто заказчик Лиоры?"));
    const { drafts, skipped } = buildProposalDrafts(
      { openQuestions: ["Кто заказчик Лиоры?"] },
      existing
    );
    expect(drafts).toEqual([]);
    expect(skipped[0]?.reason).toBe("duplicate_canon");
  });

  it("не создаёт дубль вопроса, ожидающего решения", () => {
    const existing = emptyExistingSets();
    existing.pending.OPEN_QUESTION.add(normalizeName("Кто заказчик?"));
    const { skipped } = buildProposalDrafts(
      { openQuestions: ["кто заказчик"] },
      existing
    );
    expect(skipped[0]?.reason).toBe("duplicate_pending");
  });

  it("не возвращает вопрос, ранее отклонённый автором", () => {
    const existing = emptyExistingSets();
    existing.rejected.OPEN_QUESTION.add(normalizeName("Кто заказчик?"));
    const { skipped } = buildProposalDrafts(
      { openQuestions: ["Кто заказчик?"] },
      existing
    );
    expect(skipped[0]?.reason).toBe("previously_rejected");
  });

  it("повтор вопроса внутри одного анализа создаёт одно предложение", () => {
    const { drafts, skipped } = buildProposalDrafts({
      openQuestions: ["Кто заказчик?", "  кто   заказчик? "],
    });
    expect(drafts).toHaveLength(1);
    expect(skipped[0]?.reason).toBe("duplicate_in_analysis");
  });

  it("повторный анализ ничего нового не создаёт", () => {
    const input = { openQuestions: ["Кто заказчик?", "Куда ведёт путь?"] };
    const first = buildProposalDrafts(input);
    const existing = emptyExistingSets();
    for (const d of first.drafts) {
      existing.pending[d.entityType].add(normalizeName(d.name));
    }
    expect(buildProposalDrafts(input, existing).drafts).toEqual([]);
  });

  it("счётчик «только для просмотра» больше не включает вопросы", () => {
    const { notMapped } = buildProposalDrafts({
      openQuestions: ["Кто заказчик?"],
      facts: ["Факт"],
    });
    expect(notMapped.openQuestions).toBe(0);
    expect(notMapped.facts).toBe(1);
  });
});

describe("Canon не меняется при создании предложений", () => {
  const route = readFileSync(
    "src/app/api/projects/[id]/story-bible/proposals/route.ts",
    "utf8"
  );

  it("маршрут не импортирует шлюз записи в Canon", () => {
    expect(route).not.toMatch(/canon\/write/);
  });

  it("маршрут не создаёт и не меняет записи Canon напрямую", () => {
    const direct =
      /prisma\.(character|worldEntity|worldRule|plotLine|event|openQuestion|secret|relationship)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)/;
    expect(route).not.toMatch(direct);
  });

  it("маршрут создаёт только предложения со статусом PENDING", () => {
    expect(route).toMatch(/prisma\.proposal\.create/);
    expect(route).toMatch(/status:\s*"PENDING"/);
  });
});
