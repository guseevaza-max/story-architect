import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Маршрут извлечения фактов из Lore Library (настоящий обработчик).
 * База данных заменена хранилищем в памяти, модель — заглушкой, авторизация
 * — заглушкой. Это НЕ тест на реальной базе и на реальной модели.
 */

const h = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  projects: [] as any[],
  materials: [] as any[],
  proposals: [] as any[],
  canonFacts: [] as any[],
  canonFactCreates: 0,
  completeCalls: [] as any[],
  completeImpl: null as null | ((req: any) => Promise<any>),
}));

vi.mock("@/auth", () => ({
  auth: async () => (h.userId ? { user: { id: h.userId } } : null),
}));

vi.mock("@/lib/ai/provider", () => {
  class AiProviderError extends Error {
    constructor(message: string, readonly status?: number) {
      super(message);
    }
  }

  return {
    AiProviderError,
    redact: (value: string) => value.replace(/sk-[A-Za-z0-9]+/g, "sk-***"),
    complete: async (req: any) => {
      h.completeCalls.push(req);
      if (!h.completeImpl) throw new Error("completeImpl не задан");
      return h.completeImpl(req);
    },
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findFirst: async ({ where }: any) =>
        h.projects.find((p) => p.id === where.id && p.userId === where.userId) ?? null,
    },
    loreMaterial: {
      findFirst: async ({ where }: any) =>
        h.materials.find((m) => m.id === where.id && m.projectId === where.projectId) ?? null,
    },
    proposal: {
      findMany: async ({ where }: any) =>
        h.proposals.filter(
          (p) =>
            p.projectId === where.projectId &&
            p.entityType === where.entityType &&
            where.status.in.includes(p.status)
        ),
      create: async ({ data }: any) => {
        const row = { id: `prop-${h.proposals.length + 1}`, ...data };
        h.proposals.push(row);
        return row;
      },
    },
    canonFact: {
      findMany: async ({ where }: any) =>
        h.canonFacts.filter((f) => f.projectId === where.projectId && f.status === where.status),
      create: async () => {
        h.canonFactCreates++;
        return { id: "never" };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { POST } from "../src/app/api/projects/[id]/lore/[materialId]/extract/route";
import { AiProviderError } from "../src/lib/ai/provider";

const TEXT =
  "Империя Пепла основана императором Каэлем в 312 году.\nСтолица империи — Ривенхольм, город у замёрзшего моря.\nСовет Трёх Гильдий управляет торговлей империи.";

const ctx = (id = "p1", materialId = "m1") => ({
  params: Promise.resolve({ id, materialId }),
});

const call = (id?: string, materialId?: string) =>
  POST(new Request("http://t", { method: "POST" }), ctx(id, materialId));

const modelFact = (statement: string, quote: string, extra: Record<string, unknown> = {}) => ({
  statement,
  evidenceQuote: quote,
  confidence: 0.9,
  category: "HISTORY",
  ambiguity: "",
  ...extra,
});

const answer = (facts: unknown[]) => async () => ({
  text: JSON.stringify({ facts }),
  model: "test-model",
});

const goodFacts = [
  modelFact("Империю Пепла основал император Каэль", "Империя Пепла основана императором Каэлем в 312 году."),
  modelFact("Столица империи — Ривенхольм", "Столица империи — Ривенхольм, город у замёрзшего моря."),
];

beforeEach(() => {
  h.userId = "user-1";
  h.projects = [
    { id: "p1", userId: "user-1" },
    { id: "p2", userId: "user-2" },
  ];
  h.materials = [
    { id: "m1", projectId: "p1", title: "Хроники", content: TEXT },
    { id: "m2", projectId: "p2", title: "Чужое", content: TEXT },
    { id: "m3", projectId: "p1", title: "Пустое", content: "   " },
  ];
  h.proposals = [];
  h.canonFacts = [];
  h.canonFactCreates = 0;
  h.completeCalls = [];
  h.completeImpl = answer(goodFacts);
});

describe("доступ", () => {
  it("без входа — 401, модель не вызывается", async () => {
    h.userId = null;
    expect((await call()).status).toBe(401);
    expect(h.completeCalls).toHaveLength(0);
  });

  it("чужой проект — 404, модель не вызывается", async () => {
    const response = await call("p2", "m2");
    expect(response.status).toBe(404);
    expect(h.completeCalls).toHaveLength(0);
    expect(h.proposals).toHaveLength(0);
  });

  it("материал другого проекта недоступен — 404", async () => {
    const response = await call("p1", "m2");
    expect(response.status).toBe(404);
    expect(h.completeCalls).toHaveLength(0);
  });

  it("несуществующий материал — 404", async () => {
    expect((await call("p1", "нет")).status).toBe(404);
  });
});

describe("входные данные и ошибки AI", () => {
  it("пустой материал — 400, модель не вызывается", async () => {
    const response = await call("p1", "m3");
    expect(response.status).toBe(400);
    expect(h.completeCalls).toHaveLength(0);
  });

  it("запрос к модели: класс STRONG, текст из базы, структурированный ответ", async () => {
    await call();
    expect(h.completeCalls).toHaveLength(1);
    const request = h.completeCalls[0];
    expect(request.modelClass).toBe("STRONG");
    expect(request.jsonSchema.name).toBe("lore_fact_extraction");
    expect(request.messages[1].content).toContain("Империя Пепла основана императором Каэлем");
  });

  it("ошибка настройки AI — 503, предложения не создаются", async () => {
    h.completeImpl = async () => {
      throw new AiProviderError("OPENAI_API_KEY не настроен.");
    };
    const response = await call();
    expect(response.status).toBe(503);
    expect(h.proposals).toHaveLength(0);
  });

  it("ошибка провайдера со статусом — 502, ключ в сообщении скрыт", async () => {
    h.completeImpl = async () => {
      throw new AiProviderError("Провайдер вернул 401: key sk-secret123456", 401);
    };
    const response = await call();
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error).not.toContain("secret123456");
    expect(h.proposals).toHaveLength(0);
  });

  it("неожиданное исключение при вызове модели — 502", async () => {
    h.completeImpl = async () => {
      throw new Error("сеть недоступна");
    };
    expect((await call()).status).toBe(502);
  });

  it("некорректный JSON и пустой ответ — 502, ничего не создаётся", async () => {
    for (const text of ["не json", "", '{"facts": ']) {
      h.completeImpl = async () => ({ text, model: "m" });
      expect((await call()).status).toBe(502);
    }
    expect(h.proposals).toHaveLength(0);
  });

  it("ответ без списка facts — 502", async () => {
    h.completeImpl = async () => ({ text: '{"result": []}', model: "m" });
    expect((await call()).status).toBe(502);
  });

  it("пустой список фактов — успех без предложений", async () => {
    h.completeImpl = answer([]);
    const body = await (await call()).json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(0);
  });
});

describe("создание предложений", () => {
  it("каждый факт — Proposal LORE_FACT / CREATE / PENDING", async () => {
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.created).toBe(2);
    expect(h.proposals).toHaveLength(2);

    for (const proposal of h.proposals) {
      expect(proposal.entityType).toBe("LORE_FACT");
      expect(proposal.op).toBe("CREATE");
      expect(proposal.status).toBe("PENDING");
      expect(proposal.projectId).toBe("p1");
      expect(proposal.reason).toContain("Хроники");
    }
  });

  it("payload хранит утверждение, цитату, источник, уверенность и категорию", async () => {
    await call();
    const payload = h.proposals[0].payload;

    expect(payload.entityType).toBe("LORE_FACT");
    expect(payload.data.statement).toBe("Империю Пепла основал император Каэль");
    expect(payload.data.evidenceQuote).toBe("Империя Пепла основана императором Каэлем в 312 году.");
    expect(payload.data.confidence).toBe(0.9);
    expect(payload.data.category).toBe("HISTORY");
    expect(payload.data.source).toEqual({
      type: "LORE_MATERIAL",
      materialId: "m1",
      materialTitle: "Хроники",
    });
  });

  it("неоднозначность сохраняется в payload", async () => {
    h.completeImpl = answer([
      modelFact("Совет управляет торговлей", "Совет Трёх Гильдий управляет торговлей империи.", {
        ambiguity: "Не ясно, какие именно гильдии",
        confidence: 0.6,
      }),
    ]);
    await call();
    expect(h.proposals[0].payload.data.ambiguity).toBe("Не ясно, какие именно гильдии");
    expect(h.proposals[0].payload.data.confidence).toBe(0.6);
  });

  it("факт с выдуманной цитатой отклоняется и не создаётся", async () => {
    h.completeImpl = answer([
      ...goodFacts,
      modelFact("Император правил сорок лет", "Император Каэль правил империей сорок лет подряд."),
    ]);
    const body = await (await call()).json();

    expect(body.created).toBe(2);
    expect(body.skipped).toEqual([
      { statement: "Император правил сорок лет", reason: "quote_not_found" },
    ]);
    expect(h.proposals.map((p) => p.payload.data.statement)).not.toContain("Император правил сорок лет");
  });

  it("при извлечении Canon не меняется", async () => {
    await call();
    expect(h.canonFactCreates).toBe(0);
    expect(h.canonFacts).toHaveLength(0);
  });
});

describe("повторное извлечение и дубликаты", () => {
  it("повторный запуск не создаёт дублей ожидающих предложений", async () => {
    await call();
    const second = await (await call()).json();

    expect(second.created).toBe(0);
    expect(second.skipped.map((s: any) => s.reason)).toEqual(["duplicate_pending", "duplicate_pending"]);
    expect(h.proposals).toHaveLength(2);
  });

  it("отклонённые автором факты не возвращаются", async () => {
    await call();
    h.proposals[0].status = "REJECTED";

    const second = await (await call()).json();
    expect(second.created).toBe(0);
    expect(second.skipped.map((s: any) => s.reason).sort()).toEqual([
      "duplicate_pending",
      "previously_rejected",
    ]);
  });

  it("факты, уже принятые в Canon, не предлагаются снова", async () => {
    h.canonFacts = [
      { projectId: "p1", status: "CANON", statement: "Столица империи — Ривенхольм" },
    ];
    const body = await (await call()).json();

    expect(body.created).toBe(1);
    expect(body.skipped).toEqual([
      { statement: "Столица империи — Ривенхольм", reason: "already_canon" },
    ]);
  });

  it("предложения другого материала не мешают", async () => {
    h.materials.push({ id: "m4", projectId: "p1", title: "Другой", content: TEXT });
    await call("p1", "m1");
    const other = await (await call("p1", "m4")).json();

    expect(other.created).toBe(2);
    expect(h.proposals).toHaveLength(4);
  });
});

describe("ограничения объёма", () => {
  it("слишком длинный материал обрабатывается частично и помечается", async () => {
    h.materials[0].content = "Империя Пепла основана императором Каэлем в 312 году. " + "Слово. ".repeat(10000);
    const body = await (await call()).json();

    expect(body.truncated).toBe(true);
    expect(h.completeCalls[0].messages[1].content.length).toBeLessThan(31000);
  });
});
