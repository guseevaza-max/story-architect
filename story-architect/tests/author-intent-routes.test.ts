import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Проверка передачи авторского замысла в Architect, Scene Planner, Writer
 * и Continuity через НАСТОЯЩИЕ обработчики маршрутов.
 *
 * Важно: это НЕ тест на реальной базе и на реальной модели. База данных
 * заменена записывающей заглушкой, клиент модели — заглушкой, которая
 * запоминает отправленный промпт. Логика маршрутов, сборка контекста
 * (Canon, состояние истории, планы) и блок замысла настоящие.
 */

const h = vi.hoisted(() => ({
  chapters: {} as Record<string, any>,
  project: null as any,
  captured: [] as string[],
  modelOutput: "" as string,
  updates: [] as { model: string; args: any }[],
}));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/ai/provider", () => {
  const capture = (args: any) => {
    const parts: string[] = [];
    for (const message of args?.input ?? args?.messages ?? []) {
      parts.push(typeof message.content === "string" ? message.content : JSON.stringify(message.content));
    }
    h.captured.push(parts.join("\n\n"));
  };

  return {
  AI_NOT_CONFIGURED_MESSAGE: "AI не настроен.",
  isOpenAIConfigured: () => true,
  hasOpenAIKey: () => true,
  getOpenAIClient: () => ({
      responses: {
        create: async (args: any) => {
          capture(args);
          return { output_text: h.modelOutput, output: [] };
        },
      },
      chat: {
        completions: {
          create: async (args: any) => {
            capture(args);
            return { choices: [{ message: { content: "{}" } }] };
          },
        },
      },
    }),
  };
});

vi.mock("@prisma/client", () => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => async (args: any) => {
          if (name === "project" && (method === "findFirst" || method === "findUnique")) {
            return h.project;
          }
          if (name === "chapter" && (method === "findFirst" || method === "findUnique")) {
            // Запрос предыдущей главы (number < N): предыдущей нет.
            if (args?.where?.number?.lt !== undefined) return null;
            return h.chapters[args?.where?.id] ?? null;
          }
          if (method === "update") h.updates.push({ model: name, args });

          switch (method) {
            case "findMany":
              return [];
            case "findFirst":
            case "findUnique":
              return null;
            case "updateMany":
            case "deleteMany":
              return { count: 0 };
            case "count":
              return 0;
            default:
              return { id: `${name}-id`, ...(args?.data ?? {}) };
          }
        },
      }
    );

  const client: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "$transaction") {
          return async (arg: any) =>
            typeof arg === "function" ? arg(client) : Promise.all(arg);
        }
        if (prop === "$disconnect") return async () => undefined;
        return model(prop);
      },
    }
  );

  return {
    Prisma: { JsonNull: "__JsonNull__", DbNull: "__DbNull__" },
    AiRunStatus: { SUCCESS: "SUCCESS", FAILED: "FAILED" },
    ProposalOp: { CREATE: "CREATE", UPDATE: "UPDATE", DELETE: "DELETE" },
    PrismaClient: class {
      constructor() {
        return client;
      }
    },
  };
});

import { POST as architectPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/architect/route";
import { POST as scenePlannerPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/scene-planner/route";
import { POST as writerPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/writer/route";
import { POST as continuityPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/continuity/route";

const planJson = {
  chapterPurpose: "Показать масштаб угрозы",
  initialState: "Герой в порту",
  endState: "Герой понял, что угроза велика",
  plotDevelopment: ["Развитие А"],
  characterDevelopment: ["Развитие Б"],
  mustHappen: ["Встреча"],
  mustNotHappen: ["Раскрытие тайны"],
  openQuestions: [],
};

function chapter(id: string, number: number, authorIntent: unknown) {
  return {
    id,
    number,
    title: `Глава ${number}`,
    purpose: "Цель главы",
    status: "DRAFT",
    bookId: "book-1",
    book: { id: "book-1", number: 1, title: "Книга", projectId: "project-1" },
    authorIdea: "Идея автора для главы",
    authorIntent,
    plan: planJson,
    planApproved: true,
    scenes: [
      {
        id: `${id}-s1`,
        order: 1,
        title: "Сцена 1",
        purpose: "Начало",
        plan: "Тихое начало",
        plannedOutcome: "Тревога",
        status: "APPROVED",
      },
    ],
    draftText: "Черновик главы для проверки.",
    wordCount: 4,
  };
}

const intent = {
  scale: "EPIC",
  drama: "TENSE",
  pace: "RISING",
  focus: "MYSTERY",
  referenceIds: ["r1"],
  freePrompt: "Начать с тихой камерной сцены и не торопить кульминацию",
  readerEffect: "ощущение чего-то огромного",
};

const library = [
  {
    id: "r1",
    title: "Нарастание тревоги",
    category: "ATMOSPHERE",
    technique: "тревога через детали и реакцию людей",
    instruction: "Не называть угрозу прямо",
    notes: "ЛИЧНАЯ ЗАМЕТКА",
    active: true,
    isDefault: false,
  },
];

const ctx = (chapterId: string) => ({
  params: Promise.resolve({ id: "project-1", chapterId }),
});

const post = () => new Request("http://test", { method: "POST" });

const routes = [
  { name: "Architect", run: architectPOST },
  { name: "Scene Planner", run: scenePlannerPOST },
  { name: "Writer", run: writerPOST },
  { name: "Continuity", run: continuityPOST },
] as const;

async function promptFor(run: (r: Request, c: any) => Promise<Response>, chapterId: string) {
  h.captured.length = 0;
  const response = await run(post(), ctx(chapterId));
  const prompt = h.captured[0];

  if (prompt === undefined) {
    throw new Error(
      `Промпт не получен, ответ маршрута: ${response.status} ${await response.text()}`
    );
  }

  return prompt;
}

beforeEach(() => {
  h.captured.length = 0;
  h.updates.length = 0;
  h.modelOutput = "";
  h.project = {
    id: "project-1",
    userId: "user-1",
    name: "Параллакс",
    projectRules: null,
    authorReferences: library,
  };
  h.chapters = {
    "ch-with": chapter("ch-with", 2, intent),
    "ch-without": chapter("ch-without", 3, null),
  };
});

describe("авторский замысел доходит до генераторов (настоящие маршруты, заглушки БД и модели)", () => {
  for (const { name, run } of routes) {
    it(`${name}: промпт содержит замысел главы`, async () => {
      const prompt = await promptFor(run, "ch-with");

      if (name === "Continuity") {
        // Continuity получает только принцип, а не сами предпочтения.
        expect(prompt).toContain("АВТОРСКИЙ ЗАМЫСЕЛ ГЛАВЫ");
        expect(prompt).toContain("НЕ факты мира");
        expect(prompt).not.toContain("Масштабность");
        return;
      }

      expect(prompt).toContain("АВТОРСКИЙ ЗАМЫСЕЛ ГЛАВЫ");
      expect(prompt).toContain("Масштабность: эпическая");
      expect(prompt).toContain("Драматичность: напряжённая");
      expect(prompt).toContain("Темп: нарастающий");
      expect(prompt).toContain("Основной акцент: тайна и неизвестность");
      expect(prompt).toContain("ощущение чего-то огромного");
      expect(prompt).toContain("Начать с тихой камерной сцены и не торопить кульминацию");
    });

    it(`${name}: личные заметки референса в промпт не попадают`, async () => {
      const prompt = await promptFor(run, "ch-with");
      expect(prompt).not.toContain("ЛИЧНАЯ ЗАМЕТКА");
    });
  }

  it("Architect получает выбранный референс", async () => {
    const prompt = await promptFor(architectPOST, "ch-with");
    expect(prompt).toContain("Нарастание тревоги");
    expect(prompt).toContain("Не называть угрозу прямо");
    expect(prompt).toContain("Конфликт замысла:");
  });

  it("Scene Planner получает замысел вместе с утверждённым планом главы", async () => {
    const prompt = await promptFor(scenePlannerPOST, "ch-with");
    expect(prompt).toContain("Распредели замысел по сценам");
    expect(prompt).toContain("Показать масштаб угрозы");
    expect(prompt).toContain("Нарастание тревоги");
  });

  it("Writer получает замысел, референсы, Canon и утверждённые планы одновременно", async () => {
    const prompt = await promptFor(writerPOST, "ch-with");

    // замысел и референсы
    expect(prompt).toContain("Масштабность: эпическая");
    expect(prompt).toContain("Нарастание тревоги");
    expect(prompt).toContain("Начать с тихой камерной сцены");
    // Canon, состояние истории, планы
    expect(prompt).toContain("CANON FACTS");
    expect(prompt).toContain("СОСТОЯНИЕ ИСТОРИИ НА НАЧАЛО ГЛАВЫ");
    expect(prompt).toContain("УТВЕРЖДЁННЫЙ ПЛАН ГЛАВЫ");
    expect(prompt).toContain("Показать масштаб угрозы");
    expect(prompt).toContain("УТВЕРЖДЁННЫЙ ПЛАН СЦЕН");
    expect(prompt).toContain("Тихое начало");
    // иерархия: Canon выше замысла
    expect(prompt).toContain("Системные ограничения и защита Canon");
    expect(prompt).toContain("не разрешает менять утверждённые события");
  });

  it("авторские инструкции не обходят Canon: правило иерархии присутствует у всех генераторов", async () => {
    for (const run of [architectPOST, scenePlannerPOST, writerPOST]) {
      const prompt = await promptFor(run, "ch-with");
      expect(prompt).toContain("не разрешает менять утверждённые события, характеры и факты мира");
    }
  });
});

describe("главы без замысла и независимость глав", () => {
  for (const { name, run } of routes) {
    it(`${name}: без замысла и референсов блока нет, генерация прежняя`, async () => {
      const prompt = await promptFor(run, "ch-without");
      expect(prompt).not.toContain("АВТОРСКИЙ ЗАМЫСЕЛ");
      expect(prompt).not.toContain("Нарастание тревоги");
    });
  }

  it("пустой замысел и отсутствие поля дают одинаковый промпт", async () => {
    h.chapters["ch-without"] = chapter("ch-without", 3, null);
    const withNull = await promptFor(writerPOST, "ch-without");

    h.chapters["ch-without"] = { ...chapter("ch-without", 3, null), authorIntent: undefined };
    const withUndefined = await promptFor(writerPOST, "ch-without");

    expect(withNull).toBe(withUndefined);
  });

  it("настройки одной главы не попадают в промпт другой", async () => {
    const other = await promptFor(writerPOST, "ch-without");
    expect(other).not.toContain("Начать с тихой камерной сцены");
    expect(other).not.toContain("Масштабность");
  });

  it("референсы по умолчанию применяются и к главе без замысла, пока она не выбрала свои", async () => {
    h.project.authorReferences = [{ ...library[0], isDefault: true }];

    const inherited = await promptFor(writerPOST, "ch-without");
    expect(inherited).toContain("Нарастание тревоги");

    h.chapters["ch-without"] = chapter("ch-without", 3, { referenceIds: [] });
    const overridden = await promptFor(writerPOST, "ch-without");
    expect(overridden).not.toContain("Нарастание тревоги");
  });

  it("неактивный референс в промпт не попадает", async () => {
    h.project.authorReferences = [{ ...library[0], active: false }];
    const prompt = await promptFor(writerPOST, "ch-with");
    expect(prompt).not.toContain("Нарастание тревоги");
  });
});

describe("Writer: конфликт замысла с Canon сообщается автору, а не попадает в текст главы", () => {
  const marker = "=== ЗАМЕЧАНИЯ ДЛЯ АВТОРА ===";

  it("раздел замечаний возвращается отдельно и не сохраняется в черновик", async () => {
    h.modelOutput = `Тихое начало главы. Герой идёт по порту.\n\n${marker}\nЗамысел требовал раскрыть тайну, но Canon это запрещает.`;

    const response = await writerPOST(post(), ctx("ch-with"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authorNotes).toBe("Замысел требовал раскрыть тайну, но Canon это запрещает.");
    expect(body.draftText).toBe("Тихое начало главы. Герой идёт по порту.");

    const saved = h.updates.find((u) => u.model === "chapter");
    expect(saved?.args.data.draftText).toBe("Тихое начало главы. Герой идёт по порту.");
    expect(saved?.args.data.draftText).not.toContain("Canon это запрещает");
  });

  it("без конфликта текст сохраняется целиком, замечаний нет", async () => {
    h.modelOutput = "Просто текст главы без замечаний.";

    const body = await (await writerPOST(post(), ctx("ch-with"))).json();

    expect(body.authorNotes).toBeNull();
    expect(body.draftText).toBe("Просто текст главы без замечаний.");
  });

  it("утверждённую главу Writer по-прежнему не перезаписывает", async () => {
    h.chapters["ch-with"] = { ...chapter("ch-with", 2, intent), status: "CANON" };
    h.modelOutput = "Новый текст";

    const response = await writerPOST(post(), ctx("ch-with"));

    expect(response.status).toBe(409);
    expect(h.updates.find((u) => u.model === "chapter")).toBeUndefined();
  });
});
