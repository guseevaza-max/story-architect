import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beatCreateSchema,
  beatUpdateSchema,
  bookFieldsSchema,
  reorderSchema,
  revealOrderError,
  secretCreateSchema,
} from "../src/lib/plotMap/schema";

/**
 * Сюжетная карта: проверка данных и настоящие обработчики API.
 * База заменена хранилищем в памяти — это НЕ тест на реальной базе.
 */

const h = vi.hoisted(() => ({
  userId: "u1" as string | null,
  projects: [{ id: "p1", userId: "u1" }, { id: "p2", userId: "u2" }] as any[],
  books: [] as any[],
  beats: [] as any[],
  secrets: [] as any[],
  seq: 0,
}));

vi.mock("@/auth", () => ({
  auth: async () => (h.userId ? { user: { id: h.userId } } : null),
}));

const match = (row: any, where: any = {}) =>
  Object.entries(where).every(([key, cond]: [string, any]) =>
    cond && typeof cond === "object" && "in" in cond ? cond.in.includes(row[key]) : row[key] === cond
  );

const table = (rows: () => any[], prefix: string, defaults: (data: any) => any = () => ({})) => ({
  findFirst: async ({ where, orderBy }: any = {}) => {
    let list = rows().filter((r) => match(r, where));
    if (orderBy?.order === "desc") list = [...list].sort((a, b) => b.order - a.order);
    return list[0] ?? null;
  },
  findMany: async ({ where, orderBy }: any = {}) => {
    const list = rows().filter((r) => match(r, where));
    return Array.isArray(orderBy) ? [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : list;
  },
  create: async ({ data }: any) => {
    const row = { id: `${prefix}${++h.seq}`, ...defaults(data), ...data };
    rows().push(row);
    return row;
  },
  update: async ({ where, data }: any) => {
    const row = rows().find((r) => r.id === where.id);
    Object.assign(row, data);
    return row;
  },
  deleteMany: async ({ where }: any) => {
    const list = rows();
    const hit = list.filter((r) => match(r, where));
    hit.forEach((r) => list.splice(list.indexOf(r), 1));
    return { count: hit.length };
  },
});

vi.mock("@/lib/db", () => {
  const prisma: any = {
    project: { findFirst: async ({ where }: any) => h.projects.find((p) => match(p, where)) ?? null },
    book: table(() => h.books, "b"),
    plotBeat: table(() => h.beats, "beat"),
    secret: table(() => h.secrets, "s"),
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma };
});

describe("схемы сюжетной карты", () => {
  it("веха без номера главы допустима, пустые поля становятся null", () => {
    const r = beatCreateSchema.parse({ name: " Знакомство с Кайреном ", description: "  " });
    expect(r).toMatchObject({
      name: "Знакомство с Кайреном",
      description: null,
      plannedChapterFrom: null,
      plannedChapterTo: null,
      approval: "IDEA",
      disclosure: "HIDDEN",
      characters: [],
    });
  });

  it("название обязательно, диапазон глав проверяется", () => {
    expect(beatCreateSchema.safeParse({ name: " " }).success).toBe(false);
    expect(
      beatCreateSchema.safeParse({ name: "x", plannedChapterFrom: 10, plannedChapterTo: 4 }).success
    ).toBe(false);
    expect(beatCreateSchema.safeParse({ name: "x", approval: "СЕКРЕТ" }).success).toBe(false);
  });

  it("при правке не переданные поля остаются undefined, а очищенные становятся null", () => {
    const r = beatUpdateSchema.parse({ description: "", approval: "APPROVED" });
    expect(r.description).toBeNull();
    expect(r.approval).toBe("APPROVED");
    expect("name" in r && r.name !== undefined).toBe(false);
    expect(r.characters).toBeUndefined();
  });

  it("порядок раскрытия тайны: намёки → частично → полностью", () => {
    expect(revealOrderError({ hintFromChapter: 2, partialRevealChapter: 8, plannedRevealChapter: 20 })).toBeNull();
    expect(revealOrderError({ hintFromChapter: 9, partialRevealChapter: 3 })?.path).toBe("partialRevealChapter");
    expect(revealOrderError({ partialRevealChapter: 12, plannedRevealChapter: 5 })?.path).toBe("plannedRevealChapter");
    expect(secretCreateSchema.safeParse({ name: "Вторая Система", hintFromChapter: 9, plannedRevealChapter: 3 }).success).toBe(false);
  });

  it("поля книги и порядок вех", () => {
    expect(bookFieldsSchema.parse({ themes: "  память " }).themes).toBe("память");
    expect(reorderSchema.safeParse({ ids: ["a", "a"] }).success).toBe(false);
    expect(reorderSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});

const call = async (mod: string, method: string, body?: unknown, params: any = { id: "p1" }, url = "http://x/") => {
  const route = await import(`../src/app/api/projects/[id]/plot-map/${mod}`);
  return route[method](
    new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    { params: Promise.resolve(params) }
  );
};

beforeEach(() => {
  h.userId = "u1";
  h.books = [];
  h.beats = [];
  h.secrets = [];
  h.seq = 0;
});

describe("API вех", () => {
  it("создание: книга создаётся при необходимости, порядок растёт, глава не обязательна", async () => {
    const a = await call("beats/route", "POST", { name: "Катастрофа" });
    const b = await call("beats/route", "POST", { name: "Пробуждение", approval: "APPROVED", plannedChapterFrom: 1, plannedChapterTo: 2 });
    expect(a.status).toBe(201);
    expect(h.books).toHaveLength(1);
    expect(h.beats.map((x) => [x.name, x.order])).toEqual([["Катастрофа", 0], ["Пробуждение", 1]]);
    expect(h.beats[0].plannedChapterFrom).toBeNull();
    expect(b.status).toBe(201);
  });

  it("чужой проект и отсутствие входа не пропускаются", async () => {
    expect((await call("beats/route", "POST", { name: "x" }, { id: "p2" })).status).toBe(404);
    h.userId = null;
    expect((await call("beats/route", "POST", { name: "x" })).status).toBe(401);
    expect(h.beats).toHaveLength(0);
  });

  it("правка меняет только переданные поля и проверяет диапазон со старыми значениями", async () => {
    await call("beats/route", "POST", { name: "Веха", plannedChapterFrom: 5 });
    const id = h.beats[0].id;

    const ok = await call("beats/[beatId]/route", "PATCH", { approval: "APPROVED" }, { id: "p1", beatId: id });
    expect(ok.status).toBe(200);
    expect(h.beats[0]).toMatchObject({ name: "Веха", approval: "APPROVED", plannedChapterFrom: 5 });

    const bad = await call("beats/[beatId]/route", "PATCH", { plannedChapterTo: 2 }, { id: "p1", beatId: id });
    expect(bad.status).toBe(400);
    expect(h.beats[0].plannedChapterTo ?? null).toBeNull();
  });

  it("перестановка меняет порядок и отклоняет чужие вехи", async () => {
    await call("beats/route", "POST", { name: "A" });
    await call("beats/route", "POST", { name: "B" });
    await call("beats/route", "POST", { name: "C" });
    const [a, b, c] = h.beats.map((x) => x.id);

    expect((await call("beats/reorder/route", "POST", { ids: [c, a, b] })).status).toBe(200);
    expect(h.beats.map((x) => [x.name, x.order])).toEqual([["A", 1], ["B", 2], ["C", 0]]);

    expect((await call("beats/reorder/route", "POST", { ids: [a, "чужая"] })).status).toBe(400);
  });

  it("удаление веты своего проекта; чужая не удаляется", async () => {
    await call("beats/route", "POST", { name: "A" });
    const id = h.beats[0].id;
    expect((await call("beats/[beatId]/route", "DELETE", undefined, { id: "p2", beatId: id })).status).toBe(404);
    expect(h.beats).toHaveLength(1);
    expect((await call("beats/[beatId]/route", "DELETE", undefined, { id: "p1", beatId: id })).status).toBe(200);
    expect(h.beats).toHaveLength(0);
  });
});

describe("API книги и тайн", () => {
  it("замысел книги: создаётся и затем обновляется, пустое поле очищается", async () => {
    await call("book/route", "PATCH", { premise: "Салим переносится в чужое тело", themes: "память" });
    expect(h.books).toHaveLength(1);
    await call("book/route", "PATCH", { premise: "", themes: "утрата" });
    expect(h.books).toHaveLength(1);
    expect(h.books[0]).toMatchObject({ premise: null, themes: "утрата" });
  });

  it("тайна создаётся автором как CANON; порядок раскрытия проверяется при правке", async () => {
    const created = await call("secrets/route", "POST", { name: "Вторая Система", hintFromChapter: 3, plannedRevealChapter: 20 });
    expect(created.status).toBe(201);
    expect(h.secrets[0]).toMatchObject({ status: "CANON", kind: "SECRET" });
    const id = h.secrets[0].id;

    const bad = await call("secrets/[secretId]/route", "PATCH", { partialRevealChapter: 25 }, { id: "p1", secretId: id });
    expect(bad.status).toBe(400);

    const ok = await call("secrets/[secretId]/route", "PATCH", { partialRevealChapter: 12, forbiddenEarly: "Природа Второй Системы" }, { id: "p1", secretId: id });
    expect(ok.status).toBe(200);
    expect(h.secrets[0]).toMatchObject({ partialRevealChapter: 12, forbiddenEarly: "Природа Второй Системы" });
  });

  it("загрузка карты возвращает вехи по порядку и тайны проекта", async () => {
    await call("beats/route", "POST", { name: "A" });
    await call("secrets/route", "POST", { name: "T" });
    const res = await call("route", "GET", undefined, { id: "p1" }, "http://x/?bookNumber=1");
    const data = await res.json();
    expect(data.beats.map((b: any) => b.name)).toEqual(["A"]);
    expect(data.secrets).toHaveLength(1);
    expect(data.book).not.toBeNull();
  });
});
