import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * p32: основа Соавтора. Настоящие обработчики маршрутов и сервис; база, модель,
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
        create: async (args: any) => {
          h.modelCalls.push(args);
          if (h.fail) throw h.fail;
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

import { GET as listThreads, POST as createThread } from "../src/app/api/projects/[id]/coauthor/threads/route";
import { GET as getThread, PATCH as patchThread, DELETE as deleteThread } from "../src/app/api/projects/[id]/coauthor/threads/[threadId]/route";
import { POST as postMessage } from "../src/app/api/projects/[id]/coauthor/threads/[threadId]/messages/route";
import { assembleCoauthorContext, type CoauthorContextInput } from "../src/lib/coauthor/context";
import { buildRequest, windowHistory } from "../src/lib/coauthor/service";
import { detectSpoiler } from "../src/lib/coauthor/spoiler";
import { COAUTHOR_LIMITS } from "../src/lib/coauthor/tiers";
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
      const row = { id: id(name[0]!), createdAt: new Date(), updatedAt: new Date(), archivedAt: null, ...data, seq: ++n };
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
    reply: "Вот мой разбор.", finish: "stop", usage: { prompt_tokens: 1000, completion_tokens: 500 }, fail: null, writes: [],
  });
});

async function newThread(body: any = { title: "Тест" }, projectId = "p1") {
  const res = await createThread(json(body), ctx(projectId));
  return { res, body: await res.json() };
}
const send = (threadId: string, body: any, projectId = "p1") => postMessage(json(body), ctx(projectId, threadId));

describe("беседы: создание, чтение, переименование, архив, удаление", () => {
  it("создаёт беседу, показывает в списке, переименовывает и архивирует", async () => {
    const { res, body } = await newThread({ title: "Идея финала", scope: "TOPIC" });
    expect(res.status).toBe(201);
    expect(body.thread.defaultTier).toBe("LUNA");

    let list = await (await listThreads(new Request("http://x/"), ctx())).json();
    expect(list.threads).toHaveLength(1);

    const renamed = await patchThread(json({ title: "Финал" }, "PATCH"), ctx("p1", body.thread.id));
    expect((await renamed.json()).thread.title).toBe("Финал");

    await patchThread(json({ archived: true }, "PATCH"), ctx("p1", body.thread.id));
    list = await (await listThreads(new Request("http://x/"), ctx())).json();
    expect(list.threads).toHaveLength(0);
    const arch = await (await listThreads(new Request("http://x/?archived=true"), ctx())).json();
    expect(arch.threads).toHaveLength(1);

    await patchThread(json({ archived: false }, "PATCH"), ctx("p1", body.thread.id));
    list = await (await listThreads(new Request("http://x/"), ctx())).json();
    expect(list.threads).toHaveLength(1);
  });

  it("беседа о главе берёт название из главы; CHAPTER без главы отклоняется", async () => {
    const ok = await newThread({ scope: "CHAPTER", chapterId: "c1" });
    expect(ok.res.status).toBe(201);
    expect(ok.body.thread.title).toContain("Глава 1");
    const bad = await newThread({ scope: "CHAPTER" });
    expect(bad.res.status).toBe(400);
  });

  it("читает сообщения беседы по порядку", async () => {
    const { body } = await newThread();
    await send(body.thread.id, { text: "Первый вопрос" });
    await send(body.thread.id, { text: "Второй вопрос" });
    const got = await (await getThread(new Request("http://x/"), ctx("p1", body.thread.id))).json();
    expect(got.messages.map((m: any) => m.role)).toEqual(["AUTHOR", "COAUTHOR", "AUTHOR", "COAUTHOR"]);
  });

  it("чтение беседы показывает цену каждого ответа из записи учёта, а не пересчитывает её", async () => {
    const { body } = await newThread();
    await send(body.thread.id, { text: "Вопрос" });
    h.usage = undefined;
    await send(body.thread.id, { text: "Ещё вопрос" });
    const got = await (await getThread(new Request("http://x/"), ctx("p1", body.thread.id))).json();
    const replies = got.messages.filter((m: any) => m.role === "COAUTHOR");
    expect(replies[0].cost.status).toBe("KNOWN");
    expect(replies[0].cost.usd).toBeCloseTo((1000 / 1e6) * 0.2 + (500 / 1e6) * 1.2, 8);
    expect(replies[1].cost.status).toBe("UNKNOWN");
    expect(replies[1].cost.usd).toBeNull();
    expect(replies[1].cost.assumedUsd).toBeGreaterThan(0);
    expect(got.messages.find((m: any) => m.role === "AUTHOR").cost).toBeNull();
  });

  it("цена чужого учёта не подмешивается: запись AiRun другого пользователя не читается", async () => {
    const { body } = await newThread();
    await send(body.thread.id, { text: "Вопрос" });
    store.t.aiRun[0]!.userId = "u2";
    const got = await (await getThread(new Request("http://x/"), ctx("p1", body.thread.id))).json();
    expect(got.messages.find((m: any) => m.role === "COAUTHOR").cost).toBeNull();
  });

  it("удаление требует явного подтверждения и убирает беседу с сообщениями, а AiRun остаётся", async () => {
    const { body } = await newThread();
    await send(body.thread.id, { text: "Вопрос" });
    const no = await deleteThread(new Request("http://x/", { method: "DELETE" }), ctx("p1", body.thread.id));
    expect(no.status).toBe(400);
    expect((await no.json()).code).toBe("CONFIRM_REQUIRED");
    expect(store.t.coauthorThread).toHaveLength(1);

    const yes = await deleteThread(new Request("http://x/?confirm=true", { method: "DELETE" }), ctx("p1", body.thread.id));
    expect(yes.status).toBe(200);
    expect(store.t.coauthorThread).toHaveLength(0);
    expect(store.t.coauthorMessage).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(1);
  });

  it("беседа в архиве не принимает сообщения", async () => {
    const { body } = await newThread();
    await patchThread(json({ archived: true }, "PATCH"), ctx("p1", body.thread.id));
    const res = await send(body.thread.id, { text: "Привет" });
    expect(res.status).toBe(409);
    expect(h.modelCalls).toHaveLength(0);
  });
});

describe("изоляция пользователей и проектов", () => {
  it("без входа: 401 везде", async () => {
    h.userId = null;
    expect((await listThreads(new Request("http://x/"), ctx())).status).toBe(401);
    expect((await createThread(json({ title: "x" }), ctx())).status).toBe(401);
  });

  it("чужой проект: 404 на список, создание, чтение и отправку", async () => {
    const { body } = await newThread();
    expect((await listThreads(new Request("http://x/"), ctx("p2"))).status).toBe(404);
    expect((await createThread(json({ title: "x" }), ctx("p2"))).status).toBe(404);
    expect((await getThread(new Request("http://x/"), ctx("p2", body.thread.id))).status).toBe(404);
    expect((await send(body.thread.id, { text: "Привет" }, "p2")).status).toBe(404);
    expect(h.modelCalls).toHaveLength(0);
  });

  it("беседа другого пользователя в том же проекте недоступна", async () => {
    store.t.coauthorThread.push({ id: "tx", projectId: "p1", userId: "u2", title: "Чужая", scope: "TOPIC", chapterId: null, defaultTier: "LUNA", archivedAt: null });
    for (const call of [
      () => getThread(new Request("http://x/"), ctx("p1", "tx")),
      () => patchThread(json({ title: "Взлом" }, "PATCH"), ctx("p1", "tx")),
      () => deleteThread(new Request("http://x/?confirm=true", { method: "DELETE" }), ctx("p1", "tx")),
      () => send("tx", { text: "Привет" }),
    ]) {
      expect((await call()).status).toBe(404);
    }
    expect(store.t.coauthorThread).toHaveLength(1);
    expect(store.t.coauthorThread[0]!.title).toBe("Чужая");
  });

  it("беседа другого проекта пользователя недоступна через чужой projectId", async () => {
    store.t.project.push({ id: "p3", userId: "u1", name: "Второй проект" });
    const { body } = await newThread();
    expect((await getThread(new Request("http://x/"), ctx("p3", body.thread.id))).status).toBe(404);
  });

  it("несуществующая и чужая глава: 404", async () => {
    expect((await newThread({ scope: "CHAPTER", chapterId: "нет" })).res.status).toBe(404);
    expect((await newThread({ scope: "CHAPTER", chapterId: "c9" })).res.status).toBe(404);
    const { body } = await newThread();
    const res = await send(body.thread.id, { text: "Что тут?", fragment: { chapterId: "c9", text: "Чужой текст" } });
    expect(res.status).toBe(404);
    expect(h.modelCalls).toHaveLength(0);
  });
});

describe("AI Gateway: бюджет, модель, учёт", () => {
  it("по умолчанию Luna; один AiRun на ответ; сообщение ссылается на него", async () => {
    const { body } = await newThread();
    const res = await send(body.thread.id, { text: "Как усилить финал?" });
    expect(res.status).toBe(200);
    expect(h.modelCalls).toHaveLength(1);
    expect(h.modelCalls[0].model).toBe("gpt-5.6-luna");
    expect(h.modelCalls[0].max_completion_tokens).toBe(8000);

    expect(store.t.aiRun).toHaveLength(1);
    const run = store.t.aiRun[0]!;
    expect(run.roleKey).toBe("COAUTHOR");
    expect(run.status).toBe("SUCCESS");
    expect(run.costStatus).toBe("KNOWN");
    expect(Number(run.estimatedCost)).toBeCloseTo((1000 / 1e6) * 0.2 + (500 / 1e6) * 1.2, 8);

    const reply = store.t.coauthorMessage.find((m) => m.role === "COAUTHOR")!;
    expect(reply.aiRunId).toBe(run.id);
    expect(reply.model).toBe("gpt-5.6-luna");
    expect(reply.tier).toBe("LUNA");
  });

  it("Terra только по явному выбору и резервируется по своему тарифу", async () => {
    const { body } = await newThread();
    await send(body.thread.id, { text: "Вопрос Luna" });
    await send(body.thread.id, { text: "Вопрос Terra", tier: "TERRA" });
    expect(h.modelCalls.map((c) => c.model)).toEqual(["gpt-5.6-luna", "gpt-5.6-terra"]);
    expect(h.reserves[1]! / h.reserves[0]!).toBeGreaterThan(9);
    expect(store.t.coauthorMessage.filter((m) => m.role === "COAUTHOR").map((m) => m.tier)).toEqual(["LUNA", "TERRA"]);
  });

  it("беседа с уровнем TERRA по умолчанию использует Terra; Sol не допускается", async () => {
    const t = await newThread({ title: "x", defaultTier: "TERRA" });
    await send(t.body.thread.id, { text: "Вопрос" });
    expect(h.modelCalls[0].model).toBe("gpt-5.6-terra");
    const bad = await send(t.body.thread.id, { text: "Вопрос", tier: "SOL" });
    expect(bad.status).toBe(400);
    expect((await createThread(json({ title: "x", defaultTier: "SOL" }), ctx())).status).toBe(400);
    expect(h.modelCalls).toHaveLength(1);
  });

  it("лимит исчерпан: 429, модель не вызвана, сообщения и AiRun не созданы", async () => {
    const { body } = await newThread();
    h.reserveOk = false;
    const res = await send(body.thread.id, { text: "Вопрос" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("BUDGET_EXCEEDED");
    expect(h.modelCalls).toHaveLength(0);
    expect(store.t.coauthorMessage).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(0);
  });

  it("неизвестный usage не считается нулём: AiRun с неизвестной стоимостью и оценкой для лимита", async () => {
    const { body } = await newThread();
    h.usage = undefined;
    const res = await send(body.thread.id, { text: "Вопрос" });
    expect(res.status).toBe(200);
    const run = store.t.aiRun[0]!;
    expect(run.costStatus).toBe("UNKNOWN");
    expect(run.estimatedCost).toBeNull();
    expect(run.assumedCost).toBeGreaterThan(0);
    expect(h.settles[0].assumedUsd).toBeGreaterThan(0);
  });

  it("сбой модели: 502, один AiRun со статусом FAILED, сообщения не сохранены", async () => {
    const { body } = await newThread();
    h.fail = new Error("Connection error.");
    const res = await send(body.thread.id, { text: "Вопрос" });
    expect(res.status).toBe(502);
    expect(store.t.aiRun).toHaveLength(1);
    expect(store.t.aiRun[0]!.status).toBe("FAILED");
    expect(store.t.coauthorMessage).toHaveLength(0);
  });

  it("пустой ответ модели: 502, один AiRun, без сообщений", async () => {
    const { body } = await newThread();
    h.reply = "   ";
    const res = await send(body.thread.id, { text: "Вопрос" });
    expect(res.status).toBe(502);
    expect(store.t.aiRun).toHaveLength(1);
    expect(store.t.coauthorMessage).toHaveLength(0);
  });

  it("ответ, обрезанный по длине, помечается", async () => {
    const { body } = await newThread();
    h.finish = "length";
    await send(body.thread.id, { text: "Вопрос" });
    expect(store.t.coauthorMessage.find((m) => m.role === "COAUTHOR")!.text).toContain("Ответ обрезан");
  });

  it("резерв Соавтора берётся из AI_LIMITS (роль COAUTHOR)", () => {
    expect(ROLE_ESTIMATES.COAUTHOR).toEqual({ inputTokens: 20_000, outputTokens: 8_000 });
  });
});

describe("AI_MOCK", () => {
  it("без вызова модели, без резерва и без AiRun; беседа сохраняется", async () => {
    h.mock = true;
    const { body } = await newThread();
    const res = await send(body.thread.id, { text: "Вопрос" });
    expect(res.status).toBe(200);
    expect((await res.json()).mock).toBe(true);
    expect(h.modelCalls).toHaveLength(0);
    expect(h.reserves).toHaveLength(0);
    expect(store.t.aiRun).toHaveLength(0);
    const reply = store.t.coauthorMessage.find((m) => m.role === "COAUTHOR")!;
    expect(reply.model).toBe("mock");
    expect(reply.aiRunId).toBeNull();
  });
});

describe("границы записи: Соавтор не меняет Canon, Proposal, главы, карту", () => {
  it("за полный цикл пишутся только беседы, сообщения и AiRun", async () => {
    store.t.secret.push({ name: "Тайна", objectiveTruth: "x", knowledge: [] });
    const { body } = await newThread({ scope: "CHAPTER", chapterId: "c1" });
    await send(body.thread.id, { text: "Разбери главу", fragment: { chapterId: "c1", text: "Анна вошла в комнату.", start: 0, end: 21 } });
    await patchThread(json({ title: "Новое", archived: true }, "PATCH"), ctx("p1", body.thread.id));
    await deleteThread(new Request("http://x/?confirm=true", { method: "DELETE" }), ctx("p1", body.thread.id));
    const allowed = new Set(["coauthorThread", "coauthorMessage", "aiRun"]);
    const models = new Set(h.writes.map((w) => w.split(".")[0]));
    expect([...models].filter((m) => !allowed.has(m!))).toEqual([]);
    expect(store.t.chapter[0]!.draftText).toBe("Анна вошла в комнату. Было тихо.");
  });

  it("в коде Соавтора нет записи в таблицы Canon, Proposal, глав и сюжетной карты", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const files = [...walk("src/lib/coauthor"), ...walk("src/app/api/projects/[id]/coauthor")];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\.(canonFact|proposal|chapter|scene|book|plotBeat|secret|character|storyBibleVersion|memoryChunk)\.(create|update|upsert|delete)\w*\(/);
      expect(src, f).not.toMatch(/canon\/write|applyProposal/);
    }
  });
});

describe("фрагмент главы", () => {
  it("попадает в запрос модели как данные, глава не меняется", async () => {
    const { body } = await newThread();
    const res = await send(body.thread.id, { text: "Что здесь не так?", fragment: { chapterId: "c1", text: "Анна вошла в комнату.", start: 0, end: 21 } });
    expect(res.status).toBe(200);
    const userMsg = h.modelCalls[0].messages.at(-1).content as string;
    expect(userMsg).toContain("Анна вошла в комнату.");
    expect(userMsg).toContain("глава 1");
    const author = store.t.coauthorMessage.find((m) => m.role === "AUTHOR")!;
    expect(author.fragmentChapterId).toBe("c1");
    expect(author.fragmentText).toBe("Анна вошла в комнату.");
    expect(store.t.chapter[0]!.draftText).toBe("Анна вошла в комнату. Было тихо.");
  });

  it("границы не совпадают с текстом главы: 400, модель не вызвана", async () => {
    const { body } = await newThread();
    const res = await send(body.thread.id, { text: "?", fragment: { chapterId: "c1", text: "Другой текст", start: 0, end: 12 } });
    expect(res.status).toBe(400);
    expect(h.modelCalls).toHaveLength(0);
  });

  it("одна граница без другой и перевёрнутые границы отклоняются", async () => {
    const { body } = await newThread();
    expect((await send(body.thread.id, { text: "?", fragment: { chapterId: "c1", text: "Анна", start: 0 } })).status).toBe(400);
    expect((await send(body.thread.id, { text: "?", fragment: { chapterId: "c1", text: "Анна", start: 5, end: 2 } })).status).toBe(400);
  });
});

describe("лимиты входа", () => {
  it("слишком длинное сообщение и фрагмент отклоняются до вызова модели", async () => {
    const { body } = await newThread();
    expect((await send(body.thread.id, { text: "а".repeat(COAUTHOR_LIMITS.messageChars + 1) })).status).toBe(400);
    expect((await send(body.thread.id, { text: "?", fragment: { chapterId: "c1", text: "а".repeat(COAUTHOR_LIMITS.fragmentChars + 1) } })).status).toBe(400);
    expect(h.modelCalls).toHaveLength(0);
  });

  it("окно истории: не больше N сообщений и не больше лимита знаков", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ role: "AUTHOR" as const, text: `сообщение ${i}` }));
    const w = windowHistory(many);
    expect(w).toHaveLength(COAUTHOR_LIMITS.historyMessages);
    expect(w.at(-1)!.text).toBe("сообщение 39");
    const big = Array.from({ length: 6 }, () => ({ role: "COAUTHOR" as const, text: "я".repeat(5000) }));
    expect(windowHistory(big).reduce((n, m) => n + m.text.length, 0)).toBeLessThanOrEqual(COAUTHOR_LIMITS.historyChars);
  });

  it("в запрос уходит окно беседы, а не вся история", async () => {
    const { body } = await newThread();
    for (let i = 0; i < 10; i++) await send(body.thread.id, { text: `Вопрос ${i}` });
    const last = h.modelCalls.at(-1);
    // системное сообщение + 12 из истории + новое
    expect(last.messages.length).toBe(COAUTHOR_LIMITS.historyMessages + 2);
    expect(last.messages.at(-1).content).toBe("Вопрос 9");
  });
});

// ───────────── сборщик контекста ─────────────

const baseInput = (over: Partial<CoauthorContextInput> = {}): CoauthorContextInput => ({
  project: { name: "Параллакс", premise: "Город смотрит на себя со стороны.", genre: "sci-fi", tone: "мрачный", projectRules: null },
  chapterNumber: 3,
  anchoredToChapter: true,
  canonFacts: [{ statement: "Анна — инженер.", negation: false, importance: 5 }, { statement: "Анна не умеет плавать.", negation: true, importance: 3 }],
  storyState: "Состояние: Анна жива.",
  narrative: null,
  secrets: [
    {
      name: "Происхождение города",
      objectiveTruth: "Город построен на корабле-ковчеге, который никогда не покидал орбиту",
      forbiddenEarly: "Нельзя говорить про орбиту",
      hintFromChapter: 5, partialRevealChapter: 9, plannedRevealChapter: 12,
      knowers: [{ name: "Марк", sinceChapter: 2, partial: false, knows: true }],
    },
  ],
  arcs: [{ character: "Анна", name: "Принятие", status: "DRAFT", start: "страх", current: "", target: "покой" }],
  summaries: [{ label: "гл. 2", text: "Анна нашла дневник." }],
  openQuestions: [{ question: "Кто такой Марк?", answer: null, resolved: false }],
  aiProposals: [{ entityType: "character", op: "CREATE", reason: "Новый герой" }],
  chapter: { number: 3, title: "Дневник", authorIdea: "Идея главы", intent: null, draft: "Текст черновика." },
  ...over,
});

describe("Coauthor Context Builder", () => {
  it("включает разделы со статусами и различает знание автора, персонажей и читателя", () => {
    const r = assembleCoauthorContext(baseInput());
    expect(r.text).toContain("УТВЕРЖДЁННЫЙ CANON");
    expect(r.text).toContain("Анна — инженер.");
    expect(r.text).toContain("НИКОГДА: Анна не умеет плавать.");
    expect(r.text).toContain("[РАБОЧАЯ ВЕРСИЯ] Анна");
    expect(r.text).toContain("НЕ РЕШЕНО");
    expect(r.text).toContain("ПРЕДЛОЖЕНИЯ ИИ, ЖДУЩИЕ РЕШЕНИЯ АВТОРА");
    // секрет: истина как знание автора, читателю на гл. 3 скрыто, знает Марк
    expect(r.text).toContain("Истина мира (знание автора, СПОЙЛЕР)");
    expect(r.text).toContain("читателю на главе 3: скрыто");
    expect(r.text).toContain("Знают персонажи: Марк с гл. 2");
    expect(r.text).toContain("Нельзя раскрывать раньше времени");
    expect(r.spoilerSecrets.map((s) => s.name)).toEqual(["Происхождение города"]);
  });

  it("после срока раскрытия читателю разрешено, запрет на раннее раскрытие не показывается", () => {
    const r = assembleCoauthorContext(baseInput({ chapterNumber: 12 }));
    expect(r.text).toContain("читателю на главе 12: можно раскрыть");
    expect(r.text).not.toContain("Нельзя раскрывать раньше времени");
  });

  it("тайны без знающих персонажей отмечены отдельно; пустые разделы не выводятся", () => {
    const r = assembleCoauthorContext(baseInput({ secrets: [{ ...baseInput().secrets[0]!, knowers: [] }], arcs: [], aiProposals: [], openQuestions: [] }));
    expect(r.text).toContain("Персонажи этой тайны не знают");
    expect(r.text).not.toContain("АРКИ ПЕРСОНАЖЕЙ");
    expect(r.text).not.toContain("ПРЕДЛОЖЕНИЯ ИИ");
  });

  it("потолок контекста: низкоприоритетные разделы урезаются первыми, Canon и проект остаются", () => {
    const facts = Array.from({ length: 600 }, (_, i) => ({ statement: `Факт номер ${i} `.padEnd(280, "ф"), negation: false, importance: 3 }));
    const r = assembleCoauthorContext(
      baseInput({
        canonFacts: facts,
        storyState: "с".repeat(20_000),
        summaries: Array.from({ length: 50 }, (_, i) => ({ label: `гл. ${i}`, text: "р".repeat(2000) })),
        openQuestions: Array.from({ length: 50 }, (_, i) => ({ question: "в".repeat(900) + i, answer: null, resolved: false })),
      }),
      15_000
    );
    expect(r.chars).toBeLessThanOrEqual(15_000);
    expect(r.truncated.length).toBeGreaterThan(0);
    expect(r.text).toContain("ПРОЕКТ");
    expect(r.text).toContain("УТВЕРЖДЁННЫЙ CANON");
    expect(r.sections.project).toBeGreaterThan(0);
  });

  it("по умолчанию общий размер не превышает COAUTHOR_LIMITS.contextChars", () => {
    const big = baseInput({
      canonFacts: Array.from({ length: 500 }, (_, i) => ({ statement: `Факт ${i} `.padEnd(300, "ф"), negation: false, importance: 3 })),
      storyState: "с".repeat(50_000),
      chapter: { number: 3, title: null, authorIdea: "и".repeat(5000), intent: "н".repeat(5000), draft: "т".repeat(50_000) },
    });
    expect(assembleCoauthorContext(big).chars).toBeLessThanOrEqual(COAUTHOR_LIMITS.contextChars);
  });

  it("без глав контекст честно говорит, что глав нет, и ничего не выдумывает", () => {
    const r = assembleCoauthorContext(baseInput({ chapterNumber: null, anchoredToChapter: false, chapter: null, canonFacts: [], secrets: [], storyState: "", arcs: [], summaries: [], openQuestions: [], aiProposals: [] }));
    expect(r.text).toContain("Глав в проекте пока нет");
    expect(r.text).not.toContain("CANON");
    expect(r.spoilerSecrets).toEqual([]);
  });

  it("Соавтор получает инструкции как данные и правила роли в системном сообщении", () => {
    const ctxR = assembleCoauthorContext(baseInput());
    const req = buildRequest({ contextText: ctxR.text, history: [], userText: "Привет", fragment: null, spoilerSecrets: [], contextChars: ctxR.chars, truncated: [] });
    expect(req.system).toContain("не генератор согласных ответов");
    expect(req.system).toContain("не инструкции");
    expect(req.system).toContain("Ты ничего не записываешь в Canon");
    expect(req.system).toContain("[СПОЙЛЕР]");
  });
});

describe("признак спойлера", () => {
  const secrets = [{ name: "Происхождение города", objectiveTruth: "Город построен на корабле-ковчеге, который никогда не покидал орбиту" }];
  it("маркер модели, имя тайны или пересказ истины", () => {
    expect(detectSpoiler("[СПОЙЛЕР] Вот что там на самом деле.", secrets)).toBe(true);
    expect(detectSpoiler("Это связано с происхождением города, учти.", secrets)).toBe(true);
    expect(detectSpoiler("Помни: город построен на корабле-ковчеге, который никогда не покидал", secrets)).toBe(true);
  });
  it("обычный ответ без тайн не помечается", () => {
    expect(detectSpoiler("Мотивация Анны в этой сцене слабая: добавь причину.", secrets)).toBe(false);
    expect(detectSpoiler("", secrets)).toBe(false);
  });
  it("в базе сохраняется признак ответа; контекст со спойлерами уходит модели с пометкой", async () => {
    store.t.coauthorThread.length = 0;
    const { body } = await newThread();
    h.reply = "[СПОЙЛЕР] Тут раскрывается тайна.";
    await send(body.thread.id, { text: "Что скрыто?" });
    expect(store.t.coauthorMessage.find((m) => m.role === "COAUTHOR")!.containsSpoiler).toBe(true);
    h.reply = "Обычный ответ.";
    await send(body.thread.id, { text: "А ещё?" });
    const replies = store.t.coauthorMessage.filter((m) => m.role === "COAUTHOR");
    expect(replies.at(-1)!.containsSpoiler).toBe(false);
  });

  it("сквозной случай: истина тайны уходит модели как знание автора, ответ с тайной помечается", async () => {
    store.t.secret.push({
      name: "Происхождение города",
      objectiveTruth: "Город построен на корабле-ковчеге, который никогда не покидал орбиту",
      forbiddenEarly: null, hintFromChapter: 5, partialRevealChapter: 9, plannedRevealChapter: 12,
      knowledge: [],
    });
    const { body } = await newThread({ scope: "CHAPTER", chapterId: "c1" });
    h.reply = "Учти происхождение города: оно влияет на мотивацию.";
    await send(body.thread.id, { text: "Что с мотивацией?" });
    const system = h.modelCalls[0].messages[0].content as string;
    expect(system).toContain("Истина мира (знание автора, СПОЙЛЕР)");
    expect(system).toContain("читателю на главе 1: скрыто");
    expect(store.t.coauthorMessage.find((m) => m.role === "COAUTHOR")!.containsSpoiler).toBe(true);
  });
});
