import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * p34: потоковые ответы, сценарный критик, сжатие длинных бесед. Настоящие обработчики маршрутов и сервис; база, модель,
 * авторизация и счётчик бюджета заменены заглушками. Платных запросов нет.
 */

const h = vi.hoisted(() => ({
  userId: "u1" as string | null,
  mock: false,
  reserveOk: true,
  reserves: [] as number[],
  settles: [] as any[],
  modelCalls: [] as any[],
  reply: "Вот мой разбор." as string,
  finish: "stop" as string,
  usage: { prompt_tokens: 1000, completion_tokens: 500 } as any,
  fail: null as any,
  chunks: null as any[] | null,
  failAfter: null as number | null,
  abortSeen: false,
  writes: [] as string[],
  db: null as any,
}));

vi.mock("@/auth", () => ({ auth: async () => (h.userId ? { user: { id: h.userId } } : null) }));
vi.mock("@/lib/db", () => ({ prisma: new Proxy({}, { get: (_t, k) => h.db[k as string] }) }));
vi.mock("@/lib/plotMap/loadNarrative", () => ({ loadNarrativeContext: async () => null }));
vi.mock("@/lib/context/storyState", () => ({
  buildStoryStateWithStats: async () => ({ text: "Состояние: Анна жива.", characters: 1, states: 0, relationships: 0 }),
}));
vi.mock("@/lib/ai/provider", () => ({
  hasOpenAIKey: () => true,
  isMockMode: () => h.mock,
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: async (args: any, opts?: any) => {
          h.modelCalls.push(args);
          if (h.fail) throw h.fail;
          if (args.stream) {
            const chunks = h.chunks ?? [
              { choices: [{ delta: { content: "Вот " } }] },
              { choices: [{ delta: { content: "ответ." }, finish_reason: "stop" }] },
              { choices: [], usage: h.usage },
            ];
            return (async function* () {
              let i = 0;
              for (const c of chunks) {
                if (opts?.signal?.aborted) {
                  h.abortSeen = true;
                  throw Object.assign(new Error("aborted"), { name: "AbortError" });
                }
                if (h.failAfter !== null && i === h.failAfter) throw new Error("обрыв соединения");
                i++;
                yield c;
                await new Promise((r) => setTimeout(r, 0));
              }
            })();
          }
          return { choices: [{ message: { content: h.reply }, finish_reason: h.finish }], usage: h.usage };
        },
      },
    },
  }),
}));
vi.mock("@/lib/ai/budget", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/budget")>();
  return {
    ...real,
    createPrismaTrackingDeps: () => ({
      store: {
        reserve: async ({ amountUsd }: any) => {
          if (!h.reserveOk) return { ok: false };
          h.reserves.push(amountUsd);
          return { ok: true };
        },
        settle: async (a: any) => void h.settles.push(a),
      },
      findPrice: async (_p: string, model: string) =>
        model.includes("terra")
          ? { inputPer1M: 2, outputPer1M: 12, cachedInputPer1M: 0.2, effectiveFrom: new Date("2026-01-01") }
          : { inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, effectiveFrom: new Date("2026-01-01") },
      getLimitUsd: async () => 50,
      recordRun: async () => {
        throw new Error("recordRun не должен вызываться: маршрут пишет AiRun сам");
      },
      now: () => new Date("2026-11-05T10:00:00Z"),
      failClosed: false,
      defaultLimitUsd: 50,
      log: () => {},
    }),
  };
});

import { POST as createThread } from "../src/app/api/projects/[id]/coauthor/threads/route";
import { GET as getThread } from "../src/app/api/projects/[id]/coauthor/threads/[threadId]/route";
import { POST as postMessage } from "../src/app/api/projects/[id]/coauthor/threads/[threadId]/messages/route";
import { POST as streamMessage } from "../src/app/api/projects/[id]/coauthor/threads/[threadId]/messages/stream/route";
import { POST as summarize } from "../src/app/api/projects/[id]/coauthor/threads/[threadId]/summarize/route";
import { parseReport, renderReport } from "../src/lib/coauthor/critic";
import { planSummary, afterCutoff } from "../src/lib/coauthor/summary";
import { parseNdjson, shouldOfferSummary, asReport } from "../src/lib/coauthor/ui";
import { ROLE_ESTIMATES } from "../src/lib/ai/usage";

// ───────────── память вместо базы ─────────────

type Row = Record<string, any>;
function makeDb() {
  const t = {
    project: [{ id: "p1", userId: "u1", name: "Параллакс" }, { id: "p2", userId: "u2", name: "Чужой" }] as Row[],
    chapter: [
      { id: "c1", number: 1, title: "Начало", bookId: "b1", projectId: "p1", draftText: "Анна вошла в комнату. Было тихо.", finalText: null, authorIdea: "Идея", authorIntent: null, book: { number: 1 } },
      { id: "c9", number: 1, title: "Чужая", bookId: "b9", projectId: "p2", draftText: "Чужой текст", finalText: null, authorIdea: null, authorIntent: null, book: { number: 1 } },
    ] as Row[],
    coauthorThread: [] as Row[],
    coauthorMessage: [] as Row[],
    aiRun: [] as Row[],
    secret: [] as Row[],
  };
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const rec = (model: string, op: string) => h.writes.push(`${model}.${op}`);
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "not" in (v as any)) return row[k] !== (v as any).not;
      if (v && typeof v === "object" && "in" in (v as any)) return (v as any).in.includes(row[k]);
      if (k === "book") return row.projectId === (v as any).projectId;
      return row[k] === v;
    });
  const model = (name: keyof typeof t, extra: Row = {}) => ({
    findFirst: async ({ where }: any = {}) => {
      if (name === "chapter" && where && !where.id) {
        const mine = t.chapter.filter((c) => c.projectId === where.book?.projectId);
        return mine.sort((a, b) => b.number - a.number)[0] ?? null;
      }
      return (t[name] as Row[]).find((r) => matches(r, where)) ?? null;
    },
    findMany: async ({ where, take, orderBy }: any = {}) => {
      let rows = (t[name] as Row[]).filter((r) => matches(r, where));
      if (orderBy?.createdAt) rows = [...rows].sort((a, b) => (orderBy.createdAt === "desc" ? b.seq - a.seq : a.seq - b.seq));
      else if (orderBy?.updatedAt) rows = [...rows].reverse();
      return take ? rows.slice(0, take) : rows;
    },
    create: async ({ data }: any) => {
      rec(name, "create");
      const row = { id: id(name[0]!), mode: "DISCUSSION", summary: null, summaryUpToAt: null, summaryUpdatedAt: null, archivedAt: null, ...data, seq: ++n, createdAt: new Date(Date.UTC(2026, 0, 1) + n * 1000), updatedAt: new Date() };
      (t[name] as Row[]).push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      rec(name, "update");
      const row = (t[name] as Row[]).find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
    delete: async ({ where }: any) => {
      rec(name, "delete");
      const arr = t[name] as Row[];
      arr.splice(arr.findIndex((r) => r.id === where.id), 1);
      if (name === "coauthorThread") t.coauthorMessage = t.coauthorMessage.filter((m) => m.threadId !== where.id);
      return {};
    },
    ...extra,
  });
  const generic = { findMany: async () => [], findFirst: async () => null };
  const base: any = {
    project: model("project"),
    chapter: model("chapter"),
    coauthorThread: model("coauthorThread"),
    coauthorMessage: model("coauthorMessage"),
    aiRun: model("aiRun"),
    secret: { findMany: async () => t.secret },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
  };
  const db = new Proxy(base, { get: (o, k: string) => (k in o ? o[k] : generic) });
  return { db, t };
}

const ctx = (id = "p1", threadId?: string) => ({ params: Promise.resolve({ id, threadId: threadId as string }) });
const json = (body: unknown, method = "POST", url = "http://x/") =>
  new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let store: ReturnType<typeof makeDb>;
beforeEach(() => {
  store = makeDb();
  h.db = store.db;
  Object.assign(h, {
    userId: "u1", mock: false, reserveOk: true, reserves: [], settles: [], modelCalls: [],
    reply: "Вот мой разбор.", chunks: null, failAfter: null, abortSeen: false, finish: "stop", usage: { prompt_tokens: 1000, completion_tokens: 500 }, fail: null, writes: [],
  });
});


async function newThread(body: any = { title: "Тест" }, projectId = "p1") {
  const res = await createThread(json(body), ctx(projectId));
  return { res, body: await res.json() };
}
const send = (threadId: string, body: any) => postMessage(json(body), ctx("p1", threadId));
const stream = (threadId: string, body: any, signal?: AbortSignal) =>
  streamMessage(new Request("http://x/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal }), ctx("p1", threadId));
async function readEvents(res: Response) {
  const text = await res.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const REPORT = {
  verdict: "Глава держится, но мотивация героя слабая.",
  problems: [
    { severity: "MAJOR", category: "CHARACTER_MOTIVATION", evidence: "«Анна вошла в комнату»", problem: "Не ясно, зачем она входит.", whyItMatters: "Читатель не верит поступку.", recommendations: ["Показать причину до входа"] },
  ],
  strengths: ["Тихий, точный зачин"],
  questionsForAuthor: ["Что Анна знает на этот момент?"],
};

describe("потоковый ответ", () => {
  it("отдаёт кусками, сохраняет обмен один раз и пишет один AiRun с известной ценой", async () => {
    const { body } = await newThread();
    const res = await stream(body.thread.id, { text: "Что дальше?" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readEvents(res);
    expect(events.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("Вот ответ.");
    const done = events.find((e) => e.type === "done");
    expect(done.reply.text).toBe("Вот ответ.");
    expect(store.t.coauthorMessage).toHaveLength(2);
    expect(store.t.aiRun).toHaveLength(1);
    expect(store.t.aiRun[0]!.costStatus).toBe("KNOWN");
    expect(Number(store.t.aiRun[0]!.estimatedCost)).toBeCloseTo((1000 / 1e6) * 0.2 + (500 / 1e6) * 1.2, 8);
    expect(h.modelCalls[0].stream).toBe(true);
    expect(h.modelCalls[0].stream_options).toEqual({ include_usage: true });
    expect(h.settles).toHaveLength(1);
  });

  it("лимит бюджета: обычный JSON 429 до потока, модель не вызвана", async () => {
    const { body } = await newThread();
    h.reserveOk = false;
    const res = await stream(body.thread.id, { text: "Привет" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("BUDGET_EXCEEDED");
    expect(h.modelCalls).toHaveLength(0);
    expect(store.t.coauthorMessage).toHaveLength(0);
  });

  it("сбой до первого куска: JSON 502, ничего не сохранено, резерв освобождён", async () => {
    const { body } = await newThread();
    h.fail = new Error("сеть");
    const res = await stream(body.thread.id, { text: "Привет" });
    expect(res.status).toBe(502);
    expect(store.t.coauthorMessage).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(1);
    expect(store.t.aiRun[0]!.status).toBe("FAILED");
  });

  it("обрыв посреди потока: событие error, сообщения не сохранены, AiRun FAILED с ненулевой предполагаемой ценой", async () => {
    const { body } = await newThread();
    h.failAfter = 1;
    const res = await stream(body.thread.id, { text: "Привет" });
    expect(res.status).toBe(200);
    const events = await readEvents(res);
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(false);
    expect(store.t.coauthorMessage).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(1);
    expect(store.t.aiRun[0]!.status).toBe("FAILED");
    expect(Number(store.t.aiRun[0]!.assumedCost)).toBeGreaterThan(0);
  });

  it("отмена читателем: запрос к модели прерван, сообщения не сохранены, учёт записан", async () => {
    const { body } = await newThread();
    h.chunks = Array.from({ length: 50 }, () => ({ choices: [{ delta: { content: "слово " } }] }));
    const res = await stream(body.thread.id, { text: "Привет" });
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 50));
    expect(h.abortSeen).toBe(true);
    expect(store.t.coauthorMessage).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(1);
    expect(store.t.aiRun[0]!.status).toBe("FAILED");
  });

  it("режим заглушки: поток без платных вызовов и без AiRun", async () => {
    h.mock = true;
    const { body } = await newThread();
    const events = await readEvents(await stream(body.thread.id, { text: "Привет" }));
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(h.modelCalls).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(0);
    expect(store.t.coauthorMessage).toHaveLength(2);
  });

  it("критик не стримится; архивная беседа даёт 409", async () => {
    const critic = await newThread({ scope: "CHAPTER", chapterId: "c1", mode: "CRITIC" });
    const r1 = await stream(critic.body.thread.id, { text: "x" });
    expect(r1.status).toBe(400);
    expect((await r1.json()).code).toBe("STREAM_UNSUPPORTED");
    const t = await newThread();
    store.t.coauthorThread.find((x) => x.id === t.body.thread.id)!.archivedAt = new Date();
    expect((await stream(t.body.thread.id, { text: "x" })).status).toBe(409);
    expect(h.modelCalls).toHaveLength(0);
  });
});

describe("сценарный критик", () => {
  it("режим CRITIC требует главу", async () => {
    expect((await newThread({ mode: "CRITIC" })).res.status).toBe(400);
    expect((await newThread({ mode: "CRITIC", scope: "TOPIC" })).res.status).toBe(400);
    const ok = await newThread({ mode: "CRITIC", scope: "CHAPTER", chapterId: "c1" });
    expect(ok.res.status).toBe(201);
    expect(ok.body.thread.mode).toBe("CRITIC");
    expect(ok.body.thread.title).toContain("Критик");
  });

  it("строгий JSON-отчёт: схема передана, глава целиком в запросе, отчёт и читаемый текст сохранены", async () => {
    const { body } = await newThread({ mode: "CRITIC", scope: "CHAPTER", chapterId: "c1" });
    h.reply = JSON.stringify(REPORT);
    const res = await send(body.thread.id, { text: "Проведи критический разбор этой главы." });
    expect(res.status).toBe(200);
    const call = h.modelCalls[0];
    expect(call.response_format.type).toBe("json_schema");
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.messages[0].content).toContain("Анна вошла в комнату");
    const msg = store.t.coauthorMessage.find((m) => m.role === "COAUTHOR")!;
    expect(msg.report.verdict).toBe(REPORT.verdict);
    expect(msg.text).toContain("Не ясно, зачем она входит.");
    expect(store.t.aiRun).toHaveLength(1);
    expect(store.t.aiRun[0]!.roleKey).toBe("COAUTHOR_CRITIC");
  });

  it("критик резервирует больше обычного сообщения", async () => {
    const d = await newThread();
    await send(d.body.thread.id, { text: "Привет" });
    const c = await newThread({ mode: "CRITIC", scope: "CHAPTER", chapterId: "c1" });
    h.reply = JSON.stringify(REPORT);
    await send(c.body.thread.id, { text: "Проведи критический разбор этой главы." });
    expect(h.reserves[1]!).toBeGreaterThan(h.reserves[0]!);
  });

  it("невалидный ответ модели: 502, одна запись AiRun, сообщения не сохранены", async () => {
    const { body } = await newThread({ mode: "CRITIC", scope: "CHAPTER", chapterId: "c1" });
    h.reply = "это не json";
    const res = await send(body.thread.id, { text: "Проведи критический разбор этой главы." });
    expect(res.status).toBe(502);
    expect(store.t.coauthorMessage).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(1);
  });

  it("пустая глава: 400 NO_TEXT без обращения к модели", async () => {
    store.t.chapter[0]!.draftText = "  ";
    const { body } = await newThread({ mode: "CRITIC", scope: "CHAPTER", chapterId: "c1" });
    const res = await send(body.thread.id, { text: "Проведи критический разбор этой главы." });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NO_TEXT");
    expect(h.modelCalls).toHaveLength(0);
  });

  it("глава удалена: 400 CHAPTER_GONE", async () => {
    const { body } = await newThread({ mode: "CRITIC", scope: "CHAPTER", chapterId: "c1" });
    store.t.coauthorThread[0]!.chapterId = null;
    const res = await send(body.thread.id, { text: "Проведи критический разбор этой главы." });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("CHAPTER_GONE");
    expect(h.modelCalls).toHaveLength(0);
  });

  it("parseReport и renderReport", () => {
    expect(parseReport(JSON.stringify(REPORT)).ok).toBe(true);
    expect(parseReport("{").ok).toBe(false);
    expect(parseReport(JSON.stringify({ ...REPORT, problems: [{ severity: "HUGE" }] })).ok).toBe(false);
    const p = parseReport(JSON.stringify(REPORT));
    if (!p.ok) throw new Error();
    const text = renderReport(p.report);
    expect(text).toContain("Серьёзно");
    expect(text).toContain("Вопросы к автору");
  });
});

describe("сжатие длинной беседы", () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: (i % 2 ? "COAUTHOR" : "AUTHOR") as "AUTHOR" | "COAUTHOR", text: `сообщение ${i}`, createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000) }));

  it("planSummary: короткая беседа, нечего сжимать, обычный случай", () => {
    expect(planSummary(mk(5), null)).toEqual({ ok: false, reason: "TOO_SHORT" });
    const plan = planSummary(mk(14), null);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.fold).toHaveLength(8);
    expect(plan.cutoff).toEqual(plan.fold[7]!.createdAt);
    const again = planSummary(mk(14), plan.cutoff);
    expect(again.ok).toBe(false);
    expect(afterCutoff(mk(14), plan.cutoff)).toHaveLength(6);
  });

  async function longThread(count = 14) {
    const { body } = await newThread();
    for (let i = 0; i < count; i++) {
      store.t.coauthorMessage.push({ id: `x${i}`, threadId: body.thread.id, role: i % 2 ? "COAUTHOR" : "AUTHOR", text: `реплика ${i}`, createdAt: new Date(Date.UTC(2026, 0, 2) + i * 1000), seq: 1000 + i });
    }
    return body.thread.id as string;
  }
  const doSummarize = (id: string) => summarize(new Request("http://x/", { method: "POST" }), ctx("p1", id));

  it("сохраняет пересказ и границу, сообщения не удаляет; следующий запрос видит пересказ и не видит свёрнутые", async () => {
    const id = await longThread();
    h.reply = "Решено автором: Анна не знает правды.";
    const res = await doSummarize(id);
    expect(res.status).toBe(200);
    const th = store.t.coauthorThread[0]!;
    expect(th.summary).toContain("Анна не знает правды");
    expect(th.summaryUpToAt).toBeTruthy();
    expect(store.t.coauthorMessage).toHaveLength(14);
    expect(store.t.aiRun).toHaveLength(1);
    expect(store.t.aiRun[0]!.roleKey).toBe("COAUTHOR_SUMMARY");

    h.reply = "ответ";
    await send(id, { text: "Продолжим" });
    const call = h.modelCalls.at(-1);
    const all = JSON.stringify(call.messages);
    expect(all).toContain("Анна не знает правды");
    expect(all).not.toContain("реплика 0");
    expect(all).toContain("реплика 13");
  });

  it("лимит бюджета: беседа не меняется", async () => {
    const id = await longThread();
    h.reserveOk = false;
    const res = await doSummarize(id);
    expect(res.status).toBe(429);
    expect(store.t.coauthorThread[0]!.summary).toBeNull();
    expect(h.modelCalls).toHaveLength(0);
  });

  it("короткая беседа и пустой ответ модели", async () => {
    const short = await longThread(4);
    const r1 = await doSummarize(short);
    expect(r1.status).toBe(400);
    expect((await r1.json()).code).toBe("TOO_SHORT");
    expect(h.modelCalls).toHaveLength(0);

    store.t.coauthorMessage.length = 0;
    const id = await longThread();
    h.reply = "   ";
    const r2 = await doSummarize(id);
    expect(r2.status).toBe(502);
    expect(store.t.coauthorThread.at(-1)!.summary).toBeNull();
  });

  it("режим заглушки: пересказ-заглушка без платного вызова и без AiRun", async () => {
    h.mock = true;
    const id = await longThread();
    const res = await doSummarize(id);
    expect(res.status).toBe(200);
    expect(h.modelCalls).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(0);
    expect(store.t.coauthorThread[0]!.summary).toContain("AI_MOCK");
  });
});

describe("помощники интерфейса", () => {
  it("parseNdjson собирает события через границы кусков и пропускает мусор", () => {
    const a = parseNdjson('{"type":"delta","text":"при');
    expect(a.events).toHaveLength(0);
    const b = parseNdjson(a.rest + 'вет"}\nмусор\n{"type":"done"}\n{"type":"del');
    expect(b.events.map((e) => e.type)).toEqual(["delta", "done"]);
    expect(b.rest).toBe('{"type":"del');
  });

  it("shouldOfferSummary", () => {
    expect(shouldOfferSummary(10, false)).toBe(false);
    expect(shouldOfferSummary(16, false)).toBe(true);
    expect(shouldOfferSummary(30, true, 5)).toBe(false);
    expect(shouldOfferSummary(30, true, 16)).toBe(true);
  });

  it("asReport терпит повреждённые данные", () => {
    expect(asReport(null)).toBeNull();
    expect(asReport("x")).toBeNull();
    expect(asReport({ verdict: 1 })).toBeNull();
    const r = asReport({ verdict: "ок", problems: [{ severity: "BAD", problem: "x", recommendations: [] }, REPORT.problems[0]], strengths: [1, "a"] });
    expect(r!.problems).toHaveLength(1);
    expect(r!.strengths).toEqual(["a"]);
    expect(r!.questionsForAuthor).toEqual([]);
  });
});
