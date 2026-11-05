import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHOR_NOTES_MARKER } from "../src/lib/authorIntent/prompt";

/**
 * Writer и предпросмотр: общий Narrative Context. База и модель заменены
 * заглушками, настоящих запросов нет.
 */

const h = vi.hoisted(() => ({
  userId: "u1" as string | null,
  chapter: null as any,
  book: null as any,
  beats: [] as any[],
  secrets: [] as any[],
  canonCount: 3,
  output: "Салим вошёл в комнату.",
  prompts: [] as string[],
  writes: [] as string[],
}));

vi.mock("@/auth", () => ({ auth: async () => (h.userId ? { user: { id: h.userId } } : null) }));
vi.mock("@/lib/ai/provider", () => ({
  hasOpenAIKey: () => true,
  getOpenAIClient: () => ({
    responses: {
      create: async (req: any) => {
        h.prompts.push(req.input.map((m: any) => m.content).join("\n"));
        return { output_text: h.output };
      },
    },
  }),
}));
vi.mock("@/lib/context/storyState", () => ({
  buildStoryState: async () => "СОСТОЯНИЕ",
  memoryChunksBefore: () => ({}),
}));
vi.mock("@/lib/authorIntent/load", () => ({ loadAuthorDirectionBlock: async () => "" }));
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: async () => ({ id: "p1", name: "Параллакс" }) },
    chapter: {
      findFirst: async ({ where }: any) => (where.id ? h.chapter : null),
      update: async ({ data }: any) => {
        h.writes.push("chapter.update");
        return { id: "c1", ...data };
      },
    },
    book: { findFirst: async () => h.book },
    plotBeat: { findMany: async () => h.beats },
    secret: { findMany: async () => h.secrets },
    canonFact: {
      findMany: async () => [{ statement: "Салим — психолог", negation: false }],
      count: async () => h.canonCount,
      create: async () => { h.writes.push("canonFact.create"); },
      update: async () => { h.writes.push("canonFact.update"); },
    },
    proposal: { create: async () => { h.writes.push("proposal.create"); } },
    memoryChunk: { findMany: async () => [] },
  },
}));

const baseBook = {
  id: "b1", title: "Параллакс", number: 1,
  premise: null, mainArc: null, plannedEnding: null,
  themes: "память", centralConflicts: null, authorConstraints: "Салим не становится наместником",
};
const secret = {
  id: "s1", name: "Вторая Система", importance: 5, status: "CANON", revealStatus: "SEEDED",
  objectiveTruth: "СКРЫТАЯ-ИСТИНА", hintFromChapter: 5, partialRevealChapter: 15, plannedRevealChapter: 25,
  forbiddenEarly: "природа Второй Системы",
};
const beat = (name: string, from: number | null, approval = "APPROVED") => ({
  id: name, bookId: "b1", order: from ?? 0, name, description: null, narrativeFunction: null,
  causes: null, consequences: null, plannedChapterFrom: from, plannedChapterTo: from, approval, disclosure: "HIDDEN",
});

const chapterRow = (number: number) => ({
  id: "c1", bookId: "b1", number, title: "Г", purpose: null, authorIdea: null,
  status: "DRAFT", plan: { a: 1 }, planApproved: true,
  book: { number: 1, title: "Параллакс" },
  scenes: [{ order: 1, title: "С", purpose: null, plan: null, plannedOutcome: null }],
});

const writer = async () => {
  const { POST } = await import("../src/app/api/projects/[id]/chapters/[chapterId]/writer/route");
  return POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1", chapterId: "c1" }) });
};
const preview = async () => {
  const { GET } = await import("../src/app/api/projects/[id]/chapters/[chapterId]/narrative-context/route");
  return GET(new Request("http://x"), { params: Promise.resolve({ id: "p1", chapterId: "c1" }) });
};

beforeEach(() => {
  h.userId = "u1";
  h.chapter = chapterRow(8);
  h.book = baseBook;
  h.beats = [];
  h.secrets = [];
  h.output = "Салим вошёл в комнату.";
  h.prompts = [];
  h.writes = [];
});

describe("Writer с сюжетной картой", () => {
  it("13. предпросмотр и Writer получают один и тот же блок", async () => {
    h.beats = [beat("Встреча с Кайреном", 9)];
    h.secrets = [secret];

    const data = await (await preview()).json();
    await writer();

    expect(data.promptBlock).toContain("Встреча с Кайреном");
    expect(h.prompts[0]).toContain(data.promptBlock);
    expect(data.canonFactCount).toBe(3);
  });

  it("12. авторские ограничения и защита тайны доходят до Writer, истина скрытой тайны не доходит", async () => {
    h.chapter = chapterRow(3);
    h.secrets = [secret];
    await writer();
    expect(h.prompts[0]).toContain("Салим не становится наместником");
    expect(h.prompts[0]).toContain("природа Второй Системы");
    expect(h.prompts[0]).not.toContain("СКРЫТАЯ-ИСТИНА");
  });

  it("14. без сюжетной карты запрос остаётся прежним", async () => {
    h.book = { ...baseBook, themes: null, authorConstraints: null };
    await writer();
    expect(h.prompts[0]).not.toContain("ДОЛГОСРОЧНЫЙ СЮЖЕТНЫЙ КОНТЕКСТ");
    expect(h.prompts[0]).toContain("CANON FACTS:");
    expect(h.prompts[0]).toContain("СОСТОЯНИЕ ИСТОРИИ НА НАЧАЛО ГЛАВЫ");

    const res = await preview();
    expect((await res.json()).isEmpty).toBe(true);
  });

  it("15. ни Writer, ни предпросмотр не пишут в Canon и предложения", async () => {
    h.beats = [beat("Веха", 9)];
    h.secrets = [secret];
    await preview();
    await writer();
    expect(h.writes).toEqual(["chapter.update"]); // только черновик главы, как и раньше
  });

  it("16. замечания автора из ответа по-прежнему отделяются от текста", async () => {
    h.secrets = [secret];
    h.output = `Текст главы.\n\n${AUTHOR_NOTES_MARKER}\nВеха конфликтует с планом главы.`;
    const res = await writer();
    const data = await res.json();
    expect(data.draftText).toBe("Текст главы.");
    expect(data.authorNotes).toContain("конфликтует");
  });

  it("предпросмотр закрыт для чужих и неавторизованных", async () => {
    h.userId = null;
    expect((await preview()).status).toBe(401);
  });
});
