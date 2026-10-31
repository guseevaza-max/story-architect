import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Сохранение и загрузка авторского замысла и библиотеки референсов через
 * настоящие обработчики API. База данных заменена хранилищем в памяти,
 * авторизация — заглушкой (это НЕ тест на реальной базе).
 */

const state = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  projects: new Map<string, any>(),
  chapters: new Map<string, any>(),
}));

vi.mock("@/auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId } } : null),
}));

vi.mock("@prisma/client", () => ({
  Prisma: { DbNull: "__DbNull__", JsonNull: "__JsonNull__" },
  PrismaClient: class {},
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findFirst: async ({ where }: any) => {
        const project = state.projects.get(where.id);
        return project && (!where.userId || project.userId === where.userId)
          ? project
          : null;
      },
      update: async ({ where, data }: any) => {
        const project = state.projects.get(where.id);
        Object.assign(project, data);
        return project;
      },
    },
    chapter: {
      findFirst: async ({ where }: any) => {
        const chapter = state.chapters.get(where.id);
        return chapter && chapter.projectId === where.book.projectId
          ? chapter
          : null;
      },
      update: async ({ where, data }: any) => {
        const chapter = state.chapters.get(where.id);
        Object.assign(chapter, data);
        return chapter;
      },
    },
  },
}));

import {
  GET as getReferences,
  PUT as putReferences,
} from "../src/app/api/projects/[id]/references/route";
import {
  GET as getIntent,
  PUT as putIntent,
} from "../src/app/api/projects/[id]/chapters/[chapterId]/intent/route";

const json = (body: unknown) =>
  new Request("http://test", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const projectCtx = (id = "p1") => ({ params: Promise.resolve({ id }) });
const chapterCtx = (chapterId: string, id = "p1") => ({
  params: Promise.resolve({ id, chapterId }),
});

beforeEach(() => {
  state.userId = "user-1";
  state.projects.clear();
  state.chapters.clear();

  state.projects.set("p1", { id: "p1", userId: "user-1", authorReferences: null });
  state.projects.set("p2", { id: "p2", userId: "user-2", authorReferences: null });
  state.chapters.set("c1", { id: "c1", projectId: "p1", authorIntent: null });
  state.chapters.set("c2", { id: "c2", projectId: "p1", authorIntent: null });
  state.chapters.set("c3", { id: "c3", projectId: "p2", authorIntent: null });
});

describe("библиотека референсов (API)", () => {
  it("создаёт референс, выдаёт идентификатор и возвращает его при загрузке", async () => {
    const saved = await putReferences(
      json({
        references: [
          {
            title: "Нарастание тревоги",
            category: "ATMOSPHERE",
            technique: "тревога через детали",
            instruction: "Не называть угрозу прямо",
            notes: "моя заметка",
          },
        ],
      }),
      projectCtx()
    );
    expect(saved.status).toBe(200);

    const loaded = await (await getReferences(new Request("http://t"), projectCtx())).json();
    expect(loaded.references).toHaveLength(1);
    expect(loaded.references[0].id).toBeTruthy();
    expect(loaded.references[0].title).toBe("Нарастание тревоги");
    expect(loaded.references[0].notes).toBe("моя заметка");
    expect(loaded.references[0].active).toBe(true);
  });

  it("повторяющиеся идентификаторы заменяются, редактирование сохраняет id", async () => {
    await putReferences(
      json({
        references: [
          { id: "x", title: "Первый" },
          { id: "x", title: "Второй" },
        ],
      }),
      projectCtx()
    );
    const first = (await (await getReferences(new Request("http://t"), projectCtx())).json())
      .references;
    expect(new Set(first.map((r: { id: string }) => r.id)).size).toBe(2);

    await putReferences(
      json({ references: [{ ...first[0], title: "Изменён" }] }),
      projectCtx()
    );
    const second = (await (await getReferences(new Request("http://t"), projectCtx())).json())
      .references;
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].title).toBe("Изменён");
  });

  it("референс без названия отклоняется, сохранённое не затрагивается", async () => {
    await putReferences(json({ references: [{ id: "a", title: "Остаётся" }] }), projectCtx());

    const bad = await putReferences(json({ references: [{ title: "" }] }), projectCtx());
    expect(bad.status).toBe(400);

    expect(state.projects.get("p1").authorReferences).toHaveLength(1);
  });

  it("чужой проект недоступен, данные не меняются", async () => {
    const read = await getReferences(new Request("http://t"), projectCtx("p2"));
    expect(read.status).toBe(404);

    const write = await putReferences(json({ references: [{ title: "Взлом" }] }), projectCtx("p2"));
    expect(write.status).toBe(404);
    expect(state.projects.get("p2").authorReferences).toBeNull();
  });

  it("без входа — 401", async () => {
    state.userId = null;
    expect((await getReferences(new Request("http://t"), projectCtx())).status).toBe(401);
  });
});

describe("авторский замысел главы (API)", () => {
  it("сохраняется и загружается при повторном открытии", async () => {
    await putReferences(json({ references: [{ id: "r1", title: "Приём" }] }), projectCtx());

    const saved = await putIntent(
      json({
        intent: {
          scale: "EPIC",
          drama: "CLIMAX",
          pace: "RISING",
          focus: "MYSTERY",
          referenceIds: ["r1"],
          freePrompt: "  Начать с тихой сцены  ",
          readerEffect: "ощущение огромного",
        },
      }),
      chapterCtx("c1")
    );
    expect(saved.status).toBe(200);

    const loaded = await (await getIntent(new Request("http://t"), chapterCtx("c1"))).json();
    expect(loaded.intent).toEqual({
      scale: "EPIC",
      drama: "CLIMAX",
      pace: "RISING",
      focus: "MYSTERY",
      referenceIds: ["r1"],
      freePrompt: "Начать с тихой сцены",
      readerEffect: "ощущение огромного",
    });
    expect(loaded.references.map((r: { id: string }) => r.id)).toEqual(["r1"]);
  });

  it("настройки одной главы не влияют на другие", async () => {
    await putIntent(json({ intent: { scale: "EPIC", freePrompt: "только для c1" } }), chapterCtx("c1"));

    const other = await (await getIntent(new Request("http://t"), chapterCtx("c2"))).json();
    expect(other.intent).toBeNull();
    expect(state.chapters.get("c2").authorIntent).toBeNull();
  });

  it("пустой замысел очищает настройки главы", async () => {
    await putIntent(json({ intent: { scale: "LOCAL" } }), chapterCtx("c1"));
    await putIntent(json({ intent: { freePrompt: "   " } }), chapterCtx("c1"));

    expect(state.chapters.get("c1").authorIntent).toBe("__DbNull__");
    const loaded = await (await getIntent(new Request("http://t"), chapterCtx("c1"))).json();
    expect(loaded.intent).toBeNull();
  });

  it("неизвестные референсы отбрасываются", async () => {
    await putReferences(json({ references: [{ id: "r1", title: "Приём" }] }), projectCtx());
    await putIntent(json({ intent: { referenceIds: ["r1", "нет-такого"] } }), chapterCtx("c1"));

    const loaded = await (await getIntent(new Request("http://t"), chapterCtx("c1"))).json();
    expect(loaded.intent.referenceIds).toEqual(["r1"]);
  });

  it("некорректное значение отклоняется и не портит сохранённое", async () => {
    await putIntent(json({ intent: { scale: "EPIC" } }), chapterCtx("c1"));

    const bad = await putIntent(json({ intent: { scale: "ОГРОМНАЯ" } }), chapterCtx("c1"));
    expect(bad.status).toBe(400);
    expect(state.chapters.get("c1").authorIntent).toEqual({ scale: "EPIC" });
  });

  it("глава чужого проекта недоступна", async () => {
    const read = await getIntent(new Request("http://t"), chapterCtx("c3", "p2"));
    expect(read.status).toBe(404);

    const crossProject = await putIntent(json({ intent: { scale: "EPIC" } }), chapterCtx("c3", "p1"));
    expect(crossProject.status).toBe(404);
    expect(state.chapters.get("c3").authorIntent).toBeNull();
  });

  it("не изменяет статус и текст главы", async () => {
    state.chapters.get("c1").status = "CANON";
    state.chapters.get("c1").draftText = "Утверждённый текст";

    await putIntent(json({ intent: { scale: "EPIC" } }), chapterCtx("c1"));

    expect(state.chapters.get("c1").status).toBe("CANON");
    expect(state.chapters.get("c1").draftText).toBe("Утверждённый текст");
  });
});
