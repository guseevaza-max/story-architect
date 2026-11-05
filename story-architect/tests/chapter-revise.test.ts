import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReviseMessages,
  splitDraftAndNotes,
} from "../src/lib/chapters/reviseDraft";

const h = vi.hoisted(() => ({
  userId: "u1" as string | null,
  chapter: null as any,
  output: "Новый текст." as string | undefined,
  created: 0,
  updated: 0,
  openaiCalls: [] as any[],
  failWith: null as any,
}));

vi.mock("@/auth", () => ({
  auth: async () => (h.userId ? { user: { id: h.userId } } : null),
}));
vi.mock("@/lib/context/storyState", () => ({
  buildStoryState: async () => "состояние",
  memoryChunksBefore: () => ({}),
}));
vi.mock("@/lib/ai/provider", () => ({
  hasOpenAIKey: () => true,
  getOpenAIClient: () => ({
    responses: {
      stream: (req: any) => {
        h.openaiCalls.push(req);
        return {
          on: () => {},
          finalResponse: async () => {
            if (h.failWith) throw h.failWith;
            return { output_text: h.output };
          },
        };
      },
    },
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findFirst: async ({ where }: any) =>
        where.userId === "u1" ? { id: "p1", name: "Параллакс" } : null,
    },
    chapter: {
      findFirst: async () => h.chapter,
      update: async () => {
        h.updated++;
      },
    },
    canonFact: { findMany: async () => [{ statement: "Салим — отец Миры", negation: false }] },
    proposal: { create: async () => { h.created++; } },
  },
}));

const DRAFT = "Салим вернулся домой.\n\nЗАМЫСЕЛ И МЫСЛИ\nУ Салима есть дочь Мира, ей три года.";

describe("splitDraftAndNotes", () => {
  it("делит текст по заголовку заметок", () => {
    expect(splitDraftAndNotes(DRAFT)).toEqual({
      prose: "Салим вернулся домой.",
      notes: "ЗАМЫСЕЛ И МЫСЛИ\nУ Салима есть дочь Мира, ей три года.",
    });
  });

  it("понимает все шаблоны, двоеточие, **жирный** и регистр", () => {
    for (const h2 of ["СЦЕНА", "ЗАМЕТКА О МИРЕ", "ДИАЛОГ", "**Замечания**"].slice(0, 3)) {
      expect(splitDraftAndNotes(`Текст.\n${h2}\nзаметка`)).not.toBeNull();
    }
    expect(splitDraftAndNotes("Текст.\nзаметки для доработки:\nх")).not.toBeNull();
    expect(splitDraftAndNotes("Текст.\n**Замысел и мысли**\nх")).not.toBeNull();
  });

  it("без заголовка, без прозы или без заметок — null", () => {
    expect(splitDraftAndNotes("Просто текст.")).toBeNull();
    expect(splitDraftAndNotes("ЗАМЫСЕЛ И МЫСЛИ\nтолько заметки")).toBeNull();
    expect(splitDraftAndNotes("Текст.\nЗАМЫСЕЛ И МЫСЛИ\n")).toBeNull();
  });

  it("слово «сцена» внутри строки не считается заголовком", () => {
    expect(splitDraftAndNotes("Это сцена в доме.\nИ ещё текст.")).toBeNull();
  });
});

describe("buildReviseMessages", () => {
  it("содержит правила и данные", () => {
    const m = buildReviseMessages({
      projectName: "П", chapterTitle: "Г", canon: "к", storyState: "с",
      prose: "проза", notes: "заметка",
    });
    expect(m.system).toContain("ТОЛЬКО то, о чём сказано в заметках");
    expect(m.user).toContain("проза");
    expect(m.user).toContain("заметка");
  });
});

describe("buildReviseMessages: пометки редактора", () => {
  const prose =
    "Он не напоминал ни сирену, ни [[ВОПРОС: «голос» — у аппарата нет голоса]] аппарата.\n\n" +
    "[[КОММЕНТАРИЙ: «— Приветствуем, Чемпион Соломон.» — Приветствую тебя! Чемпион Соломон, металлический голос]]\n\n" +
    "[[КОММЕНТАРИЙ: «Это было его новое лицо.» — Для инфо! Не описывать итоговую внешность сразу]]";
  const build = () =>
    buildReviseMessages({
      projectName: "П", chapterTitle: "Г", canon: "к", storyState: "с",
      prose, notes: "", hasMarks: true,
    });

  it("пометки идут нумерованным списком, ни одна не теряется", () => {
    const { user } = build();
    expect(user).toContain("ПОМЕТКИ АВТОРА");
    expect(user).toContain("1. [ВОПРОС] фрагмент «голос» — у аппарата нет голоса");
    expect(user).toContain("2. [КОММЕНТАРИЙ]");
    expect(user).toContain("3. [КОММЕНТАРИЙ]");
  });

  it("правила учат читать заметки по смыслу и требуют отчёт по каждой пометке", () => {
    const { system } = build();
    expect(system).toContain("дословно");
    expect(system).toContain("исправь сам фрагмент");
    expect(system).toContain("НЕ вставляй в текст");
    expect(system).toContain("ВСЕГДА добавь строку");
    expect(system).toContain("«№: применено / оставлено / нужен твой выбор");
  });

  it("без пометок список и отчёт не добавляются", () => {
    const m = buildReviseMessages({
      projectName: "П", chapterTitle: "Г", canon: "к", storyState: "с",
      prose: "проза", notes: "заметка",
    });
    expect(m.user).not.toContain("ПОМЕТКИ АВТОРА");
    expect(m.system).not.toContain("№: применено");
  });
});

describe("POST /revise", () => {
  const call = async (body: unknown) => {
    const { POST } = await import(
      "../src/app/api/projects/[id]/chapters/[chapterId]/revise/route"
    );
    return POST(
      new Request("http://x", { method: "POST", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: "p1", chapterId: "c1" }) }
    );
  };

  beforeEach(() => {
    h.userId = "u1";
    h.chapter = { id: "c1", bookId: "b1", number: 1, title: "Г", draftText: DRAFT, book: { number: 1 } };
    h.output = "Салим вернулся домой, где его ждала дочь Мира.";
    h.created = 0;
    h.updated = 0;
    h.openaiCalls = [];
    h.failWith = null;
  });

  it("без входа — 401", async () => {
    h.userId = null;
    expect((await call({})).status).toBe(401);
  });

  it("предлагает версию и ничего не сохраняет", async () => {
    const res = await call({});
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.revisedText).toContain("Мира");
    expect(data.originalProse).toBe("Салим вернулся домой.");
    expect(h.updated).toBe(0);
    expect(h.created).toBe(0);
    expect(h.openaiCalls[0].input[1].content).toContain("дочь Мира");
  });

  it("берёт текст из редактора, если он передан", async () => {
    await call({ draftText: "Другое.\nСЦЕНА\nновая заметка" });
    expect(h.openaiCalls[0].input[1].content).toContain("новая заметка");
  });

  it("раздел замечаний отделяется от текста", async () => {
    h.output = "Текст.\n=== ЗАМЕЧАНИЯ ДЛЯ АВТОРА ===\nКонфликт с Canon.";
    const data = await (await call({})).json();
    expect(data.revisedText).toBe("Текст.");
    expect(data.remarks).toBe("Конфликт с Canon.");
  });

  it("пометки в тексте без блока заметок тоже запускают доработку", async () => {
    h.output = "Лейла устало кивнула.";
    const draft = "Салим вошёл. [[КОММЕНТАРИЙ: «Лейла кивнула.» — она устала]]";
    const res = await call({ draftText: draft });
    expect(res.status).toBe(200);
    expect(h.openaiCalls[0].input[0].content).toContain("[[ТИП: «фрагмент» — комментарий]]");
    expect(h.openaiCalls[0].input[1].content).toContain("учти пометки автора в тексте");
  });

  it("если модель оставила пометки, они вычищаются из результата", async () => {
    h.output = "Текст [[ВОПРОС: «фрагмент» — зачем?]] дальше.";
    const data = await (await call({})).json();
    expect(data.revisedText).toBe("Текст фрагмент дальше.");
  });

  it("нет блока заметок — 400 и модель не вызывается", async () => {
    const res = await call({ draftText: "Просто текст главы." });
    expect(res.status).toBe(400);
    expect(h.openaiCalls).toHaveLength(0);
  });

  it("обрыв соединения с OpenAI — 502 с понятным текстом", async () => {
    h.failWith = Object.assign(new TypeError("terminated"), {
      cause: { code: "UND_ERR_SOCKET" },
    });
    const res = await call({});
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Соединение с OpenAI оборвалось");
  });

  it("пустой ответ модели — 502", async () => {
    h.output = undefined;
    expect((await call({})).status).toBe(502);
  });
});
